import type { Strategy, InvestigationContext } from "./types.ts";
import { BlockedByPolicy, BudgetExceeded } from "../core/http.ts";
import { ingestSpecUrl, parseStructured, siteOf } from "./specIngest.ts";

// The site's own API often lives next to it, not on the page's origin:
// docs.example.com describes it, api.example.com serves it. This strategy
// follows those same-site hosts (from the page's doc links, Certificate
// Transparency and the conventional api.<site>) and reads what they publish:
// a JSON index of links (hypermedia, e.g. api.github.com) or documentation
// pages that spell out "GET /path" routes (e.g. docs.pypi.org/api/json/).

const DOC_ROUTE = /\bGET\s+(https?:\/\/[^\s"'<>`]+|\/[A-Za-z0-9_.~\-/{}<>:%]+(?:\?[^\s"'<>`]*)?)/g;
const MAX_HOSTS = 4;
const MAX_DOC_PAGES = 6;

export const apiHosts: Strategy = {
  id: "api-hosts",
  description: "Same-site API and docs hosts (doc links, Certificate Transparency, api.<site>): JSON link indexes and documented GET routes",
  async run(ctx) {
    const target = new URL(ctx.input.url);
    const site = siteOf(target.hostname);
    const hosts = new Set<string>();
    // Links the page publishes may point anywhere on its site. Hosts from certificates and the api.* guess
    // must belong to the target's own host: on hn.algolia.com, data.eu.algolia.com is Algolia's API, not HN's.
    const base = target.hostname.replace(/^www\./, "");
    for (const l of ctx.page?.analysis.docLinks ?? []) addHost(hosts, l, site, target.hostname);
    for (const h of ctx.apiHosts ?? []) if (h.endsWith(`.${base}`)) addHost(hosts, `https://${h}/`, site, target.hostname);
    addHost(hosts, `https://api.${base}/`, site, target.hostname);

    const parts: string[] = [];
    let found = 0;
    // API hosts first: a JSON API found there is where relative routes in the docs point.
    const priority = (u: string) => (new URL(u).hostname === `api.${base}` ? -1 : isApiHost(u) ? 0 : new URL(u).hostname !== target.hostname ? 1 : 2);
    const ordered = [...hosts].sort((a, b) => priority(a) - priority(b)).slice(0, MAX_HOSTS);
    let apiOrigin: string | undefined;
    for (const start of ordered) {
      try {
        const n = await readHost(ctx, start, apiOrigin ?? target.origin, target, (o) => (apiOrigin ??= o));
        if (n) parts.push(`${new URL(start).host}: ${n}`);
        found += n;
      } catch (e) {
        if (e instanceof BudgetExceeded) throw e;
        if (!(e instanceof BlockedByPolicy)) parts.push(`${new URL(start).host}: unreachable`);
      }
    }
    return {
      status: "ok",
      detail: hosts.size ? `${hosts.size} same-site hosts; ${found} candidate routes${parts.length ? ` (${parts.join(", ")})` : ""}` : "no same-site API or docs hosts",
    };
  },
};

const SITE_HOST = /^(api|apis|developer|developers|docs|doc|data|open|opendata|registry|public-api)[.-]/i;
const DOCS_PATH = /(^|\/)(docs?|api|apis|developers?|reference)(\/|$)/i;
const isApiHost = (u: string) => /^(api|apis|registry|public-api)[.-]/i.test(new URL(u).hostname);

function addHost(set: Set<string>, url: string, site: string, targetHost: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return;
  }
  if (u.protocol !== "https:" || siteOf(u.hostname) !== site) return;
  // On the target itself, only pages that look like API documentation (open-meteo.com/en/docs).
  if (u.hostname === targetHost ? !DOCS_PATH.test(u.pathname) : !SITE_HOST.test(u.hostname)) return;
  // Keep the doc link's path: docs.example.com/api/ is a better start than its root.
  set.add(isApiHost(u.toString()) ? `${u.origin}/` : `${u.origin}${u.pathname}`);
}

async function readHost(ctx: InvestigationContext, base: string, routeOrigin: string, target: URL, onApi: (origin: string) => void): Promise<number> {
  const r = await ctx.http.request(base, { accept: "application/json, text/html;q=0.8" });
  if ((r.status === 403 || r.status === 429) && (r.headers.get("x-ratelimit-remaining") === "0" || r.headers.has("retry-after")))
    ctx.limitations.push(`${new URL(base).host} answered ${r.status}: its rate limit for anonymous requests is used up. Retry later, or use your own key (--auth-env).`);
  if (!r.ok || r.challenge) return 0;
  const origin = new URL(r.finalUrl).origin;
  const data = /json/i.test(r.contentType) ? parseStructured(r) : undefined;
  if (data && typeof data === "object") {
    const n = readIndex(ctx, origin, data, r.finalUrl);
    if (n) onApi(origin);
    return n;
  }
  if (/html/i.test(r.contentType)) return readDocs(ctx, r.finalUrl, r.text, routeOrigin, target);
  return 0;
}

/** A JSON API root that lists its own routes, like GitHub's `"repository_url": "https://api.github.com/repos/{owner}/{repo}"`. */
function readIndex(ctx: InvestigationContext, origin: string, data: object, source: string): number {
  const urls = indexRoutes(data, origin);
  if (!urls.length) return 0;
  // The host answered JSON describing itself: it is the site's API, so the verifier may call it.
  ctx.allowedOrigins.add(origin);
  const ev = ctx.evidence.add({ strategy: "api-hosts", kind: "spec", source, summary: `API root on ${new URL(origin).host} lists ${urls.length} routes (hypermedia index)` });
  for (const template of urls)
    ctx.inventory.add({ method: "GET", url: encodeBraces(template), template, strategy: "api-hosts", evidenceId: ev.id, status: "inferred", documented: true, note: `Listed by the API's own index at ${source}` });
  return urls.length;
}

const encodeBraces = (t: string) => t.replace(/\{/g, "%7B").replace(/\}/g, "%7D");

/** Same-origin URLs a JSON API root advertises; RFC 6570 optional parts like `{?since}` or `{/number}` are dropped. */
export function indexRoutes(data: unknown, origin: string): string[] {
  const urls = new Set<string>();
  const walk = (v: unknown, depth: number) => {
    if (depth > 3 || urls.size >= 60) return;
    if (typeof v === "string") {
      if (v.startsWith(origin + "/")) urls.add(v.replace(/\{[?&/][^}]*\}/g, ""));
    } else if (v && typeof v === "object") for (const x of Object.values(v)) walk(x, depth + 1);
  };
  walk(data, 0);
  return [...urls];
}

/** "GET /pypi/<project>/json" in a documentation page → `${routeOrigin}/pypi/{project}/json`. Accepts <x>, {x} and :x placeholders. */
export function docRoutes(html: string, routeOrigin: string): string[] {
  const plain = html.replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const out = new Set<string>();
  for (const m of plain.matchAll(DOC_ROUTE)) {
    const raw = m[1]!.replace(/[.,;:)]+$/, "");
    const abs = (raw.startsWith("/") ? `${routeOrigin}${raw}` : raw).replace(/[<{:]?(\w+)[>}]?(?=\/|$|\?)/g, (t, n: string) => (/^[<{:]/.test(t) ? `{${n}}` : t));
    try {
      out.add(decodeURIComponent(new URL(abs).toString()));
    } catch {
      // not a URL
    }
  }
  return [...out];
}

/** Documentation pages: follow links that look like API reference pages, extract "GET /path" routes and spec links. */
async function readDocs(ctx: InvestigationContext, url: string, html: string, routeOrigin: string, target: URL): Promise<number> {
  const docOrigin = new URL(url).origin;
  const pages = new Map<string, string>([[url, html]]);
  const links = [...html.matchAll(/href="([^"#]+)"/g)]
    .map((m) => {
      try {
        return new URL(m[1]!, url).toString();
      } catch {
        return "";
      }
    })
    .filter((l) => l.startsWith(docOrigin) && /api|rest|reference|endpoint/i.test(new URL(l).pathname) && !/\.(png|jpe?g|svg|css|js)$/i.test(l));
  for (const l of [...new Set(links)].slice(0, MAX_DOC_PAGES - 1)) {
    if (pages.has(l)) continue;
    try {
      const r = await ctx.http.request(l, { accept: "text/html" });
      if (r.ok && /html/i.test(r.contentType)) pages.set(l, r.text);
    } catch (e) {
      if (e instanceof BudgetExceeded) throw e;
    }
  }
  let added = 0;
  for (const [page, text] of pages) {
    const examples = [...text.replace(/&amp;/g, "&").matchAll(/https:\/\/[a-z0-9.-]+\/[^\s"'<>`\\]+/gi)]
      .map((m) => m[0].replace(/[.,;:)]+$/, ""))
      .filter((u) => { const h = new URL(u).hostname; return h !== target.hostname && isApiHost(u) && siteOf(h) === siteOf(target.hostname); })
      // Docs show the same call in several formats (format=csv, xlsx); keep the JSON (default) ones.
      .filter((u) => !/[?&](format|output|type)=(?!json)[a-z]/i.test(u));
    for (const template of [...docRoutes(text, routeOrigin), ...new Set(examples)].slice(0, 40)) {
      const host = new URL(template).hostname;
      if (siteOf(host) !== siteOf(target.hostname)) continue;
      // The site's own documentation points at this API host: the verifier may call it (GET only, robots.txt honoured).
      if (host !== target.hostname && isApiHost(template)) ctx.allowedOrigins.add(new URL(template).origin);
      const ev = ctx.evidence.add({ strategy: "api-hosts", kind: "spec", source: page, summary: `Documentation describes GET ${template}` });
      ctx.inventory.add({ method: "GET", url: encodeBraces(template), template, strategy: "api-hosts", evidenceId: ev.id, status: "inferred", documented: true, note: `Documented at ${page}` });
      added++;
    }
    for (const m of text.matchAll(/href="([^"]+\.(?:json|ya?ml))"/gi)) {
      const spec = new URL(m[1]!, page).toString();
      if (/openapi|swagger|api-?docs|spec/i.test(spec)) added += await ingestSpecUrl(ctx, spec, { strategy: "api-hosts", label: "docs host" }).catch(() => 0);
    }
  }
  return added;
}
