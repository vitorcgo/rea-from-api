import type { Strategy, InvestigationContext } from "./types.ts";
import { BlockedByPolicy, BudgetExceeded } from "../core/http.ts";
import { ingestSpecUrl, siteOf } from "./specIngest.ts";

// Public, read-only third-party indexes. Base URLs are overridable for tests
// and mirrors. These calls send only the target's domain name.
const APIS_GURU = () => process.env.REA_FROM_API_APISGURU_URL ?? "https://api.apis.guru/v2";
const WAYBACK = () => process.env.REA_FROM_API_WAYBACK_URL ?? "https://web.archive.org";
const CRTSH = () => process.env.REA_FROM_API_CRTSH_URL ?? "https://crt.sh";

const API_HOST = /^(api|apis|developer|developers|dev-api|docs|data|open|opendata|graphql|gateway|public-api|registry)[.-]/i;
const API_PATH = /\/(api|apis|v\d+|graphql|rest|wp-json|_next\/data|feeds?)\/|\.json(\?|$)/i;

/**
 * Passive discovery that never touches the target to find candidates:
 * APIs.guru (official OpenAPI directory), the Wayback Machine CDX index
 * (historical JSON/API URLs) and Certificate Transparency via crt.sh
 * (api./developer. hosts the page never links to).
 */
export const passiveSources: Strategy = {
  id: "passive-sources",
  description: "APIs.guru directory, Wayback Machine CDX history and Certificate Transparency (crt.sh) → official specs, historical API URLs, API hosts",
  skip: (ctx) => (ctx.input.passive === false ? "disabled (--passive off)" : undefined),
  async run(ctx) {
    const host = new URL(ctx.input.url).hostname.replace(/^www\./, "");
    const site = siteOf(host);
    const parts: string[] = [];
    let failures = 0;
    const attempt = async (name: string, fn: () => Promise<string>) => {
      try {
        parts.push(`${name}: ${await fn()}`);
      } catch (e) {
        if (e instanceof BudgetExceeded) throw e;
        failures++;
        parts.push(`${name}: unavailable (${(e as Error).message.split("\n")[0]})`);
      }
    };
    await attempt("APIs.guru", () => apisGuru(ctx, [...new Set([host, site])]));
    await attempt("Wayback CDX", () => wayback(ctx, site));
    await attempt("crt.sh", () => certTransparency(ctx, site));
    return { status: failures === 3 ? "unavailable" : failures ? "partial" : "ok", detail: parts.join("; ") };
  },
};

async function getJson(ctx: InvestigationContext, url: string): Promise<unknown> {
  // Public indexes (Wayback CDX especially) are slow: allow 45 s instead of the default 15 s.
  const r = await ctx.http.request(url, { accept: "application/json", respectRobots: false, timeoutMs: 45_000 });
  if (r.status === 404) return undefined;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return JSON.parse(r.text);
}

async function apisGuru(ctx: InvestigationContext, domains: string[]): Promise<string> {
  let ops = 0;
  const found: string[] = [];
  for (const d of domains) {
    const doc = (await getJson(ctx, `${APIS_GURU()}/${encodeURIComponent(d)}.json`)) as
      | { apis?: Record<string, { preferred?: string; versions?: Record<string, { swaggerUrl?: string; swaggerYamlUrl?: string; info?: { title?: string } }> }> }
      | undefined;
    if (!doc?.apis) continue;
    for (const [id, api] of Object.entries(doc.apis).slice(0, 5)) {
      const v = api.versions?.[api.preferred ?? ""] ?? Object.values(api.versions ?? {})[0];
      const spec = v?.swaggerUrl ?? v?.swaggerYamlUrl;
      if (!spec) continue;
      found.push(id);
      ctx.evidence.add({ strategy: "passive-sources", kind: "spec", source: spec, summary: `APIs.guru lists "${v?.info?.title ?? id}" for ${d}` });
      ops += await ingestSpecUrl(ctx, spec, { strategy: "passive-sources", thirdParty: true, label: "APIs.guru" });
    }
    if (found.length) break;
  }
  return found.length ? `${found.length} listed APIs (${found.slice(0, 3).join(", ")}), ${ops} operations` : "not listed";
}

async function wayback(ctx: InvestigationContext, site: string): Promise<string> {
  const q = new URLSearchParams({ url: site, matchType: "domain", output: "json", fl: "original,mimetype,statuscode,timestamp", filter: "statuscode:200", collapse: "urlkey", limit: "1000" });
  const rows = (await getJson(ctx, `${WAYBACK()}/cdx/search/cdx?${q}`)) as string[][] | undefined;
  if (!Array.isArray(rows) || rows.length < 2) return "no archived URLs";
  const [header, ...data] = rows;
  const col = (n: string) => header!.indexOf(n);
  let added = 0;
  const seen = new Set<string>();
  for (const row of data) {
    if (added >= 40) break;
    const original = row[col("original")];
    const mime = row[col("mimetype")] ?? "";
    if (!original) continue;
    let u: URL;
    try {
      u = new URL(/^https?:/.test(original) ? original : `https://${original}`);
    } catch {
      continue;
    }
    if (siteOf(u.hostname) !== site) continue;
    // Archives keep http:// and www./apex variants; replay them on the target's current origin.
    const t = new URL(ctx.input.url);
    if (u.hostname.replace(/^www\./, "") === t.hostname.replace(/^www\./, "")) {
      u.protocol = t.protocol;
      u.hostname = t.hostname;
    }
    if (!/json|xml/.test(mime) && !API_PATH.test(u.pathname)) continue;
    if (/\.(js|css|png|jpe?g|svg|woff2?)$/i.test(u.pathname)) continue;
    const key = `${u.origin}${u.pathname.replace(/\d+/g, "#")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ts = row[col("timestamp")] ?? "";
    const ev = ctx.evidence.add({ strategy: "passive-sources", kind: "note", source: u.toString(), summary: `Wayback Machine archived ${mime || "?"} at ${ts.slice(0, 8)}` });
    ctx.inventory.add({ method: "GET", url: u.toString(), strategy: "wayback", evidenceId: ev.id, status: "inferred", note: `Historical URL from the Wayback Machine (${ts.slice(0, 4)}); may no longer exist` });
    added++;
  }
  return `${data.length} archived URLs scanned, ${added} API-like candidates`;
}

async function certTransparency(ctx: InvestigationContext, site: string): Promise<string> {
  if (/^[\d.]+$|:/.test(site)) return "skipped (IP address)";
  const rows = (await getJson(ctx, `${CRTSH()}/?q=${encodeURIComponent(`%.${site}`)}&output=json`)) as { name_value?: string }[] | undefined;
  if (!Array.isArray(rows)) return "no certificates";
  const hosts = new Set<string>();
  for (const r of rows.slice(0, 5000)) for (const n of (r.name_value ?? "").split(/\s+/)) if (n && !n.includes("*") && API_HOST.test(n) && n.endsWith(site)) hosts.add(n.toLowerCase());
  const probed: string[] = [];
  let ops = 0;
  for (const h of [...hosts].slice(0, 3)) {
    ctx.evidence.add({ strategy: "passive-sources", kind: "note", source: `https://${h}`, summary: `Certificate Transparency lists API-like host ${h}` });
    // Same-site API hosts: look only for published descriptions, never routes.
    for (const p of ["/.well-known/api-catalog", "/openapi.json", "/swagger.json"]) {
      try {
        const n = await ingestSpecUrl(ctx, `https://${h}${p}`, { strategy: "passive-sources", label: `CT host ${h}` });
        ops += n;
        if (n) break;
      } catch (e) {
        if (e instanceof BudgetExceeded) throw e;
        if (!(e instanceof BlockedByPolicy)) break;
      }
    }
    probed.push(h);
  }
  ctx.apiHosts = [...hosts];
  if (hosts.size > probed.length) ctx.limitations.push(`More API-like hosts in Certificate Transparency: ${[...hosts].slice(probed.length, probed.length + 5).join(", ")}`);
  return hosts.size ? `${hosts.size} API-like hosts (${probed.join(", ")}), ${ops} operations from their specs` : "no API-like hosts";
}
