import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Strategy, InvestigationContext } from "./types.ts";
import { scanJsForUrls, type JsUrlCandidate } from "../analysis/jsScan.ts";
import { BlockedByPolicy, BudgetExceeded } from "../core/http.ts";
import { findTool, runTool } from "../providers/external.ts";

interface JsSource {
  url: string;
  text: string;
  sha256?: string;
  /** Original module path when recovered from a source map. */
  original?: string;
}

interface Candidate extends JsUrlCandidate {
  queryParams?: string[];
  headers?: string[];
  engine: "jsluice" | "builtin";
}

const API_HINT = /(\/api\/|\/v\d+\/|\/graphql|\/rest\/|\/wp-json\/|\.json(\?|$)|\/ajax\/|\/_next\/data\/|\/services?\/|\/search\b)/i;
const CLIENT_MODULE = /(api|client|service|endpoint|fetcher|http|request|query)/i;
const MAX_MAPS = 5;

/**
 * Downloads same-origin script bundles (never executes them), recovers original
 * modules from source maps when published, and extracts request URLs with
 * jsluice (AST: methods, headers, params) when installed, else a built-in
 * literal scanner. All results are *inferred*.
 */
export const jsStatic: Strategy = {
  id: "js-static",
  description: "Same-origin JS bundles + published source maps → request URLs via jsluice (AST) or built-in scanner → inferred endpoints",
  skip: (ctx) => (!ctx.page ? "no HTML page to read scripts from" : undefined),
  async run(ctx) {
    const scripts = (ctx.page?.analysis.scripts ?? []).filter((s) => ctx.allowedOrigins.has(new URL(s).origin));
    const inline = [...(ctx.page?.html ?? "").matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1] ?? "").join("\n;\n");
    const sources: JsSource[] = [];
    if (inline.trim()) sources.push({ url: ctx.page!.url, text: inline });
    const maps: string[] = [];
    for (const s of scripts.slice(0, ctx.limits.maxScripts)) {
      try {
        const r = await ctx.http.request(s, { accept: "application/javascript, text/javascript, */*;q=0.5" });
        if (!r.ok || !r.text) continue;
        sources.push({ url: s, text: r.text, sha256: r.sha256 });
        const mapRef = r.headers.get("sourcemap") ?? r.headers.get("x-sourcemap") ?? /\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/m.exec(r.text.slice(-2000))?.[1];
        if (mapRef && !mapRef.startsWith("data:")) maps.push(new URL(mapRef, s).toString());
      } catch (e) {
        if (e instanceof BudgetExceeded) throw e;
        if (!(e instanceof BlockedByPolicy)) ctx.log.event("js-fetch-failed", { url: s, error: (e as Error).message });
      }
    }
    const recovered = await loadSourceMaps(ctx, maps.filter((m) => ctx.allowedOrigins.has(new URL(m).origin)).slice(0, MAX_MAPS), sources);

    const jsluice = findTool("jsluice");
    let found = 0;
    for (const src of sources) {
      // jsluice gives methods/headers/params; the built-in scanner still runs so that
      // sources jsluice cannot parse (e.g. TypeScript recovered from source maps) are covered.
      const builtin: Candidate[] = scanJsForUrls(src.text, src.url).map((c) => ({ ...c, engine: "builtin" as const }));
      const viaAst = jsluice ? await viaJsluice(jsluice, src) : [];
      const covered = new Set(viaAst.map((c) => c.absolute?.split("?")[0]));
      const candidates = [...viaAst, ...builtin.filter((c) => !covered.has(c.absolute?.split("?")[0]))];
      for (const c of candidates) {
        if (!c.absolute) continue;
        const origin = new URL(c.absolute).origin;
        const where = src.original ? `${src.original} (via source map)` : src.url;
        const ev = ctx.evidence.add({
          strategy: this.id,
          kind: "static-js",
          source: src.url,
          summary: `${c.engine === "jsluice" ? "jsluice" : "literal"} "${c.value}"${c.method ? ` ${c.method}` : ""} in ${where}`,
          sha256: src.sha256,
          excerpt: c.context.slice(0, 200) || undefined,
        });
        const placeholder = /\{param\}/.test(c.absolute);
        ctx.inventory.add({
          method: c.method ?? "GET",
          url: c.absolute,
          template: placeholder ? c.absolute : undefined,
          strategy: this.id,
          evidenceId: ev.id,
          status: "inferred",
          queryParamNames: c.queryParams,
          requiredHeaders: (c.headers ?? []).map((h) => h.toLowerCase()).filter((h) => /^(x-|authorization$|accept$|content-type$)/.test(h)),
          note: origin === new URL(ctx.input.url).origin ? `Found in JavaScript${src.original ? ` module ${src.original}` : ""}; not seen on the wire` : "Third-party URL in JavaScript",
        });
        found++;
      }
    }
    if (scripts.length > ctx.limits.maxScripts) ctx.limitations.push(`Only ${ctx.limits.maxScripts} of ${scripts.length} scripts were scanned statically (--max-scripts).`);
    if (!jsluice) ctx.limitations.push("jsluice not installed: JS extraction used the built-in literal scanner (install: go install github.com/BishopFox/jsluice/cmd/jsluice@latest).");
    return {
      status: "ok",
      detail: `${sources.length} sources (${recovered} recovered from ${maps.length} source maps), ${found} URLs via ${jsluice ? "jsluice" : "built-in scanner"}`,
    };
  },
};

async function loadSourceMaps(ctx: InvestigationContext, maps: string[], sources: JsSource[]): Promise<number> {
  let n = 0;
  for (const m of maps) {
    try {
      const r = await ctx.http.request(m, { accept: "application/json" });
      if (!r.ok) continue;
      const map = JSON.parse(r.text) as { sources?: string[]; sourcesContent?: (string | null)[] };
      const names = map.sources ?? [];
      const modules: string[] = [];
      names.forEach((name, i) => {
        const content = map.sourcesContent?.[i];
        if (!content || /node_modules|webpack\/runtime|\(webpack\)/.test(name)) return;
        if (!API_HINT.test(content) && !CLIENT_MODULE.test(name)) return;
        sources.push({ url: m.replace(/\.map$/, ""), text: content, sha256: r.sha256, original: name.replace(/^webpack:\/\/\/?/, "") });
        modules.push(name);
        n++;
      });
      ctx.evidence.add({
        strategy: "js-static",
        kind: "static-js",
        source: m,
        summary: `Source map with ${names.length} sources; ${modules.length} original modules with API calls${modules.length ? `: ${modules.slice(0, 6).join(", ")}` : ""}`,
        sha256: r.sha256,
      });
    } catch (e) {
      if (e instanceof BudgetExceeded) throw e;
    }
  }
  return n;
}

async function viaJsluice(bin: string, src: JsSource): Promise<Candidate[]> {
  const dir = mkdtempSync(join(tmpdir(), "rfa-jsluice-"));
  try {
    const file = join(dir, "source.js");
    writeFileSync(file, src.text);
    const r = await runTool(bin, ["urls", file], 60_000);
    const out = new Map<string, Candidate>();
    for (const line of r.stdout.split("\n")) {
      if (!line.trim()) continue;
      let o: { url?: string; method?: string; queryParams?: string[]; headers?: Record<string, string>; type?: string };
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      if (!o.url) continue;
      // jsluice reports every string literal too; keep literals only when they look like API paths.
      if (o.type === "stringLiteral" && !API_HINT.test(o.url)) continue;
      if (!/^(\/|https?:\/\/|\.\.?\/)/.test(o.url) || /\.(png|jpe?g|svg|css|woff2?|js|map)(\?|$)/i.test(o.url)) continue;
      const value = o.url.replace(/EXPR/g, "{param}");
      let absolute: string | undefined;
      try {
        absolute = decodeURI(new URL(value.replace(/[?&]$/, ""), src.url).toString());
      } catch {
        absolute = undefined;
      }
      const key = `${o.method || "GET"} ${value}`;
      const prev = out.get(key);
      const cand: Candidate = {
        value,
        absolute,
        context: o.type ?? "",
        method: o.method ? o.method.toUpperCase() : prev?.method,
        offset: 0,
        queryParams: o.queryParams,
        headers: o.headers ? Object.keys(o.headers) : prev?.headers,
        engine: "jsluice",
      };
      // Prefer the entry that carries a method/headers over a bare literal duplicate.
      if (!prev || (!prev.method && cand.method) || (!prev.headers && cand.headers)) out.set(key, cand);
    }
    // Drop method-less duplicates of URLs that have a method entry.
    const withMethod = new Set([...out.values()].filter((c) => c.method).map((c) => c.value));
    return [...out.values()].filter((c) => c.method || !withMethod.has(c.value));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
