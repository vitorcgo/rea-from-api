// Static HTML analysis without executing anything: technology hints,
// script/link inventory, embedded JSON data blocks and API-doc links.
// Regex-based on purpose (no dependency); it only needs well-known markers.

import type { TechFinding } from "../core/types.ts";

export interface EmbeddedBlock {
  kind: "json-ld" | "next-data" | "nuxt" | "script-json" | "inline-state";
  selector: string;
  raw: string;
  data?: unknown;
}

export interface HtmlAnalysis {
  title?: string;
  scripts: string[];
  links: { href: string; text: string; rel?: string; type?: string }[];
  forms: { action: string; method: string; inputs: string[] }[];
  embedded: EmbeddedBlock[];
  tech: TechFinding[];
  docLinks: string[];
  /** Explicit alternates (rel=alternate type=json, OpenAPI links). */
  alternates: string[];
}

const attr = (tag: string, name: string): string | undefined => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "") : undefined;
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function resolve(href: string, base: string): string | undefined {
  try {
    const u = new URL(href, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function analyzeHtml(html: string, pageUrl: string, headers?: Headers): HtmlAnalysis {
  const out: HtmlAnalysis = { scripts: [], links: [], forms: [], embedded: [], tech: [], docLinks: [], alternates: [] };
  out.title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim().slice(0, 200);

  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const tag = m[1] ?? "";
    const body = m[2] ?? "";
    const src = attr(`<x ${tag}`, "src");
    const type = (attr(`<x ${tag}`, "type") ?? "").toLowerCase();
    const id = attr(`<x ${tag}`, "id");
    if (src) {
      const abs = resolve(src, pageUrl);
      if (abs) out.scripts.push(abs);
      continue;
    }
    if (type === "application/ld+json") pushJson(out, "json-ld", `script[type="application/ld+json"]`, body);
    else if (id === "__NEXT_DATA__") pushJson(out, "next-data", "script#__NEXT_DATA__", body);
    else if (type.includes("json") && id) pushJson(out, "script-json", `script#${id}`, body);
    else if (type.includes("json")) pushJson(out, "script-json", `script[type="${type}"]`, body);
    else {
      const nuxt = /window\.__NUXT__\s*=/.test(body);
      const state = /window\.(__INITIAL_STATE__|__PRELOADED_STATE__|__APOLLO_STATE__|__data)\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(body.trim());
      if (nuxt) out.embedded.push({ kind: "nuxt", selector: "window.__NUXT__", raw: body.slice(0, 2000) });
      else if (state?.[2]) pushJson(out, "inline-state", `window.${state[1]}`, state[2]);
    }
  }

  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(`<x ${m[1] ?? ""}`, "href");
    const abs = href ? resolve(href, pageUrl) : undefined;
    if (!abs) continue;
    const text = (m[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    out.links.push({ href: abs, text });
  }
  for (const m of html.matchAll(/<link\b([^>]*)>/gi)) {
    const tag = `<x ${m[1] ?? ""}`;
    const href = attr(tag, "href");
    const abs = href ? resolve(href, pageUrl) : undefined;
    if (!abs) continue;
    const rel = attr(tag, "rel");
    const type = attr(tag, "type");
    out.links.push({ href: abs, text: "", rel, type });
    if ((rel?.includes("alternate") && type && /json|xml|rss|atom/.test(type)) || rel === "service-desc" || /openapi|swagger/i.test(abs))
      out.alternates.push(abs);
  }
  for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const tag = `<x ${m[1] ?? ""}`;
    const action = resolve(attr(tag, "action") ?? "", pageUrl) ?? pageUrl;
    const method = (attr(tag, "method") ?? "GET").toUpperCase();
    const inputs = [...(m[2] ?? "").matchAll(/<(?:input|select|textarea)\b([^>]*)>/gi)]
      .map((i) => attr(`<x ${i[1] ?? ""}`, "name"))
      .filter((n): n is string => !!n);
    out.forms.push({ action, method, inputs });
  }

  const docRe = /\b(api|developer|developers|docs|documentation|openapi|swagger|graphql|rest)\b/i;
  for (const l of out.links) {
    if (docRe.test(l.text) || /\/(api|developers?|docs)(\/|$)|openapi|swagger|api-docs|graphiql/i.test(new URL(l.href).pathname + new URL(l.href).hostname)) {
      if (!out.docLinks.includes(l.href)) out.docLinks.push(l.href);
    }
  }
  out.tech = detectTech(html, headers, out);
  return out;
}

function pushJson(out: HtmlAnalysis, kind: EmbeddedBlock["kind"], selector: string, raw: string): void {
  const text = raw.trim();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = undefined;
  }
  out.embedded.push({ kind, selector, raw: text.slice(0, 4000), data });
}

export function detectTech(html: string, headers: Headers | undefined, a: Pick<HtmlAnalysis, "scripts" | "embedded">): TechFinding[] {
  const t: TechFinding[] = [];
  const add = (name: string, basis: string) => {
    if (!t.some((x) => x.name === name)) t.push({ name, basis });
  };
  const gen = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
  if (gen) add(gen.split(" ")[0] ?? gen, `meta generator "${gen}"`);
  if (a.embedded.some((e) => e.kind === "next-data") || /\/_next\/static\//.test(html)) add("Next.js", "__NEXT_DATA__ or /_next/static/ assets");
  if (a.embedded.some((e) => e.kind === "nuxt") || /\/_nuxt\//.test(html)) add("Nuxt", "window.__NUXT__ or /_nuxt/ assets");
  if (/data-reactroot|react-dom|__REACT_DEVTOOLS/i.test(html) || a.scripts.some((s) => /react/i.test(s))) add("React", "React markers in HTML/script URLs");
  if (/ng-version=|ng-app/i.test(html)) add("Angular", "ng-version / ng-app attribute");
  if (/data-v-[0-9a-f]{6,}|vue(\.runtime)?(\.global)?(\.prod)?\.js/i.test(html)) add("Vue", "data-v-* scoped attributes or vue bundle");
  if (/data-svelte|__sveltekit/i.test(html)) add("Svelte/SvelteKit", "svelte markers");
  if (/wp-content|wp-json/i.test(html)) add("WordPress", "wp-content / wp-json references");
  if (/cdn\.shopify\.com|Shopify\.theme/i.test(html)) add("Shopify", "Shopify CDN/theme markers");
  if (/__APOLLO_STATE__|graphql/i.test(html)) add("GraphQL (possible)", "GraphQL/Apollo markers in HTML");
  if (a.embedded.some((e) => e.kind === "json-ld")) add("JSON-LD structured data", "application/ld+json blocks");
  const server = headers?.get("server");
  if (server) add(`server: ${server.slice(0, 60)}`, "Server response header");
  const powered = headers?.get("x-powered-by");
  if (powered) add(`x-powered-by: ${powered.slice(0, 60)}`, "X-Powered-By header");
  if (headers?.get("cf-ray")) add("Cloudflare", "cf-ray header");
  return t;
}

export function classifyAppType(a: HtmlAnalysis, bodyText: string): string {
  const visibleText = bodyText.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const spaShell = visibleText.length < 200 && a.scripts.length > 0;
  const fw = a.tech.map((t) => t.name).filter((n) => /Next|Nuxt|React|Angular|Vue|Svelte/.test(n));
  if (spaShell) return `client-rendered SPA shell${fw.length ? ` (${fw.join(", ")})` : ""} — data likely loaded via XHR/fetch`;
  if (fw.length) return `server-rendered/hydrated app (${fw.join(", ")})`;
  return "server-rendered HTML site";
}
