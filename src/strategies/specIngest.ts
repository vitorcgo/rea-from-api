// Shared ingestion of machine-readable API descriptions (OpenAPI 3.x, Swagger 2,
// WordPress REST index), in JSON or YAML, wherever they were found: probes on
// the target, RFC 9727 api-catalog, llms.txt, ai-plugin.json, APIs.guru, seeds.

import { parse as parseYaml } from "yaml";
import type { InvestigationContext } from "./types.ts";
import { BlockedByPolicy, BudgetExceeded, type FetchResult } from "../core/http.ts";

export interface OpenApiDoc {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string };
  servers?: { url: string }[];
  host?: string;
  basePath?: string;
  schemes?: string[];
  paths: Record<string, Record<string, { summary?: string; description?: string; operationId?: string; parameters?: { name: string; in: string; required?: boolean }[]; security?: unknown[] }>>;
  security?: unknown[];
}

export function parseStructured(r: Pick<FetchResult, "text" | "contentType">): unknown {
  const t = r.text.trim();
  if (!t) return undefined;
  if (/json/i.test(r.contentType) || /^[{[]/.test(t)) {
    try {
      return JSON.parse(t);
    } catch {
      return undefined;
    }
  }
  if (/yaml|yml|text\/plain|octet-stream/i.test(r.contentType) || /^(openapi|swagger)\s*:/m.test(t)) {
    try {
      return parseYaml(t, { maxAliasCount: 100 });
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function isOpenApi(d: unknown): d is OpenApiDoc {
  return !!d && typeof d === "object" && ("openapi" in d || "swagger" in d) && "paths" in d && typeof (d as OpenApiDoc).paths === "object";
}

/** Rough registrable-domain check (example.com, example.com.br, example.co.uk). */
export function siteOf(host: string): string {
  if (/^[\d.]+$/.test(host) || host.includes(":")) return host;
  const parts = host.split(".");
  const two = parts.slice(-2).join(".");
  return /^(com|net|org|gov|edu|co|ac)\.[a-z]{2}$/.test(two) && parts.length >= 3 ? parts.slice(-3).join(".") : two;
}

export function sameSite(a: string, b: string): boolean {
  return siteOf(new URL(a).hostname) === siteOf(new URL(b).hostname);
}

export interface IngestOptions {
  strategy: string;
  /** Fetching documentation from a third-party host (directory, CDN) — not the target. */
  thirdParty?: boolean;
  label?: string;
}

/** Fetches a URL and, if it is an API description, adds its operations. Returns operations added (0 if not a spec). */
export async function ingestSpecUrl(ctx: InvestigationContext, url: string, o: IngestOptions): Promise<number> {
  let r: FetchResult;
  try {
    r = await ctx.http.request(url, { accept: "application/json, application/yaml;q=0.9, text/yaml;q=0.9, */*;q=0.5", respectRobots: !o.thirdParty });
  } catch (e) {
    if (e instanceof BudgetExceeded) throw e;
    if (e instanceof BlockedByPolicy) return 0;
    ctx.log.event("spec-fetch-failed", { url, error: (e as Error).message });
    return 0;
  }
  if (!r.ok) return 0;
  const doc = parseStructured(r);
  if (isOpenApi(doc)) {
    const ev = ctx.evidence.add({
      strategy: o.strategy,
      kind: "spec",
      source: url,
      summary: `${o.label ? `${o.label}: ` : ""}${doc.openapi ? `OpenAPI ${doc.openapi}` : `Swagger ${doc.swagger}`} "${doc.info?.title ?? "untitled"}" (${Object.keys(doc.paths).length} paths)`,
      sha256: r.sha256,
      status: r.status,
      contentType: r.contentType,
    });
    ctx.saveSample(`spec-${new URL(url).hostname}-${ev.id}`, doc);
    return addSpecEndpoints(ctx, doc, url, ev.id, o.strategy);
  }
  if (doc && typeof doc === "object" && "routes" in doc && "namespaces" in doc) {
    const ev = ctx.evidence.add({ strategy: o.strategy, kind: "spec", source: url, summary: "WordPress REST API index (wp-json)", sha256: r.sha256, status: r.status });
    return addWpRoutes(ctx, doc as { routes: Record<string, { methods?: string[] }> }, new URL(url).origin, ev.id, o.strategy);
  }
  return 0;
}

export function addSpecEndpoints(ctx: InvestigationContext, doc: OpenApiDoc, specUrl: string, evidenceId: string, strategy: string): number {
  let base: string;
  if (doc.servers?.[0]?.url && !/\{/.test(doc.servers[0].url)) base = new URL(doc.servers[0].url, specUrl).toString();
  else if (doc.host) base = `${doc.schemes?.[0] ?? "https"}://${doc.host}${doc.basePath ?? ""}`;
  else base = new URL(specUrl).origin;
  base = base.replace(/\/$/, "");
  const baseOrigin = new URL(base).origin;
  if (!ctx.allowedOrigins.has(baseOrigin) && sameSite(baseOrigin, ctx.input.url)) {
    ctx.allowedOrigins.add(baseOrigin);
    ctx.evidence.add({ strategy, kind: "note", source: specUrl, summary: `Official spec declares server ${baseOrigin} (same site as target): allowed for read-only verification` });
  }
  let n = 0;
  for (const [path, ops] of Object.entries(doc.paths ?? {}).slice(0, 500)) {
    for (const [method, op] of Object.entries(ops ?? {})) {
      if (!/^(get|post|put|patch|delete|head)$/i.test(method) || !op || typeof op !== "object") continue;
      const params = Array.isArray(op.parameters) ? op.parameters : [];
      const query = params.filter((p) => p?.in === "query").map((p) => p.name);
      const secured = (op.security ?? doc.security ?? []).length > 0;
      const rec = ctx.inventory.add({
        method,
        url: base + path,
        template: base + path,
        strategy,
        evidenceId,
        status: "observed",
        documented: true,
        purpose: `${String(op.summary ?? op.description ?? op.operationId ?? `${method.toUpperCase()} ${path}`).slice(0, 200)} (from official spec)`,
        queryParamNames: query,
        note: "Documented in an official spec; response not yet observed",
      });
      if (secured) {
        rec.auth = "required";
        rec.authEvidence = "security requirement declared in spec";
      }
      n++;
    }
  }
  return n;
}

export function addWpRoutes(ctx: InvestigationContext, doc: { routes: Record<string, { methods?: string[] }> }, origin: string, evidenceId: string, strategy: string): number {
  let n = 0;
  for (const [route, info] of Object.entries(doc.routes).slice(0, 300)) {
    if (!(info.methods ?? []).includes("GET")) continue;
    const template = route.replace(/\(\?P<([^>]+)>[^)]*\)/g, "{$1}");
    ctx.inventory.add({
      method: "GET",
      url: `${origin}/wp-json${template}`,
      template: `${origin}/wp-json${template}`,
      strategy,
      evidenceId,
      status: "observed",
      documented: true,
      purpose: `WordPress REST route ${template} (from /wp-json index)`,
    });
    n++;
  }
  return n;
}
