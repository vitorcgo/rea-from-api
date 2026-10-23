import type { Strategy, InvestigationContext } from "./types.ts";
import { BlockedByPolicy, BudgetExceeded } from "../core/http.ts";
import { ingestSpecUrl, parseStructured } from "./specIngest.ts";

const SPEC_LIKE = /openapi|swagger|api-docs|\.(json|ya?ml)(\?|$)/i;

/**
 * Publisher-declared, machine-oriented API pointers:
 * - RFC 9727 `/.well-known/api-catalog` (application/linkset+json) and `Link: rel="api-catalog"`
 * - `Link` headers with rel service-desc / describedby on the page response
 * - `/.well-known/ai-plugin.json` (plugin manifests point at an OpenAPI document)
 * - `/llms.txt` (markdown index that often links API references and specs)
 */
export const wellKnown: Strategy = {
  id: "well-known",
  description: "RFC 9727 api-catalog, Link service-desc headers, ai-plugin.json and llms.txt → official spec and doc pointers",
  async run(ctx) {
    const origin = new URL(ctx.input.url).origin;
    const specUrls = new Set<string>();
    const docUrls = new Set<string>();
    const found: string[] = [];

    // 1. Link headers already received with the page.
    for (const l of parseLinkHeader(ctx.page?.headers.get("link") ?? null, ctx.page?.url ?? ctx.input.url)) {
      if (/service-desc|describedby/.test(l.rel)) specUrls.add(l.href);
      else if (/api-catalog/.test(l.rel)) await readCatalog(ctx, l.href, specUrls, docUrls, found);
      else if (/service-doc/.test(l.rel)) docUrls.add(l.href);
    }

    // 2. RFC 9727 well-known catalog.
    await readCatalog(ctx, `${origin}/.well-known/api-catalog`, specUrls, docUrls, found);

    // 3. ai-plugin manifest.
    const plugin = await fetchStructured(ctx, `${origin}/.well-known/ai-plugin.json`);
    const apiUrl = (plugin as { api?: { url?: string } } | undefined)?.api?.url;
    if (apiUrl) {
      specUrls.add(new URL(apiUrl, origin).toString());
      found.push("ai-plugin.json");
      ctx.evidence.add({ strategy: this.id, kind: "spec", source: `${origin}/.well-known/ai-plugin.json`, summary: `ai-plugin manifest points to API description ${apiUrl}` });
    }

    // 4. llms.txt
    try {
      const r = await ctx.http.request(`${origin}/llms.txt`, { accept: "text/plain, text/markdown" });
      if (r.ok && !/html/i.test(r.contentType) && r.text.trim()) {
        const links = [...r.text.matchAll(/\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)|(https?:\/\/[^\s)<>"']+)/g)].map((m) => new URL(m[1] ?? m[2] ?? "", origin).toString());
        const relevant = links.filter((l) => /api|openapi|swagger|developer|reference|docs/i.test(l));
        for (const l of relevant) (SPEC_LIKE.test(l) && !/\.md(\?|$)/.test(l) ? specUrls : docUrls).add(l);
        found.push("llms.txt");
        ctx.evidence.add({ strategy: this.id, kind: "http-response", source: `${origin}/llms.txt`, summary: `llms.txt lists ${links.length} links, ${relevant.length} API/doc related`, sha256: r.sha256, status: r.status });
      }
    } catch (e) {
      if (e instanceof BudgetExceeded) throw e;
    }

    let ops = 0;
    for (const u of [...specUrls].slice(0, 8)) {
      const thirdParty = new URL(u).origin !== origin;
      ops += await ingestSpecUrl(ctx, u, { strategy: this.id, thirdParty, label: "declared by publisher" });
    }
    for (const d of docUrls) ctx.evidence.add({ strategy: this.id, kind: "note", source: d, summary: "Publisher-declared API documentation (human-readable)" });
    if (docUrls.size)
      ctx.limitations.push(`Publisher-declared API docs to read for --seed candidates: ${[...docUrls].slice(0, 5).join(", ")}`);
    return { status: "ok", detail: found.length ? `${found.join(", ")} → ${specUrls.size} spec pointers, ${ops} operations, ${docUrls.size} doc links` : "no api-catalog, Link service-desc, ai-plugin.json or llms.txt" };
  },
};

async function fetchStructured(ctx: InvestigationContext, url: string, accept = "application/json"): Promise<unknown> {
  try {
    const r = await ctx.http.request(url, { accept });
    return r.ok ? parseStructured(r) : undefined;
  } catch (e) {
    if (e instanceof BudgetExceeded) throw e;
    if (!(e instanceof BlockedByPolicy)) ctx.log.event("well-known-failed", { url, error: (e as Error).message });
    return undefined;
  }
}

interface LinkTarget {
  href: string;
  type?: string;
}

async function readCatalog(ctx: InvestigationContext, url: string, specs: Set<string>, docs: Set<string>, found: string[], depth = 0): Promise<void> {
  if (depth > 2) return;
  const doc = await fetchStructured(ctx, url, 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727", application/json;q=0.9');
  const linkset = (doc as { linkset?: Record<string, LinkTarget[] | string>[] } | undefined)?.linkset;
  if (!Array.isArray(linkset)) return;
  found.push("api-catalog (RFC 9727)");
  let items = 0;
  for (const ctxObj of linkset) {
    for (const [rel, targets] of Object.entries(ctxObj)) {
      if (rel === "anchor" || !Array.isArray(targets)) continue;
      for (const t of targets) {
        if (!t?.href) continue;
        const href = new URL(t.href, url).toString();
        items++;
        if (rel === "service-desc" || (rel === "item" && (SPEC_LIKE.test(href) || /json|yaml/.test(t.type ?? "")))) specs.add(href);
        else if (rel === "api-catalog") await readCatalog(ctx, href, specs, docs, found, depth + 1);
        else docs.add(href);
      }
    }
  }
  ctx.evidence.add({ strategy: "well-known", kind: "spec", source: url, summary: `RFC 9727 API catalog with ${items} links` });
}

export function parseLinkHeader(v: string | null, base: string): { href: string; rel: string }[] {
  if (!v) return [];
  const out: { href: string; rel: string }[] = [];
  for (const part of v.split(/,(?=\s*<)/)) {
    const m = /<([^>]+)>\s*;(.*)$/.exec(part.trim());
    if (!m?.[1]) continue;
    const rel = /rel="?([^";]+)"?/i.exec(m[2] ?? "")?.[1] ?? "";
    try {
      out.push({ href: new URL(m[1], base).toString(), rel: rel.toLowerCase() });
    } catch {
      /* ignore malformed */
    }
  }
  return out;
}
