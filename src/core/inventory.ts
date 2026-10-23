// Evidence store + endpoint inventory. Strategies only *add* observations;
// merging, templating and status promotion live here so the rules are uniform.

import { createHash } from "node:crypto";
import type {
  EndpointRecord,
  EndpointStatus,
  EvidenceRecord,
  ParamInfo,
  ResponseFormat,
  Confidence,
} from "./types.ts";
import { isSensitiveName, redactUrl } from "./redact.ts";

const STATUS_RANK: Record<EndpointStatus, number> = { inferred: 0, unavailable: 1, observed: 2, confirmed: 3 };

export class EvidenceStore {
  readonly items: EvidenceRecord[] = [];
  private seq = 0;

  add(e: Omit<EvidenceRecord, "id" | "at"> & { at?: string }): EvidenceRecord {
    const rec: EvidenceRecord = { id: `ev-${String(++this.seq).padStart(4, "0")}`, at: e.at ?? new Date().toISOString(), ...e };
    this.items.push(rec);
    return rec;
  }
}

export interface EndpointObservation {
  method: string;
  url: string;
  /** Explicit template (from a spec or a seed); otherwise derived from url. */
  template?: string;
  strategy: string;
  evidenceId: string;
  status: EndpointStatus;
  documented?: boolean;
  purpose?: string;
  responseFormat?: ResponseFormat;
  contentType?: string;
  httpStatus?: number;
  requiredHeaders?: string[];
  queryParamNames?: string[];
  bodyFormat?: string;
  note?: string;
  confidence?: Confidence;
}

const ID_SEGMENT =
  /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|[A-Za-z0-9_-]{22,})$/i;

/** Turns /api/products/123?x=1 into /api/products/{id}; keeps explicit {name} placeholders. */
export function templatePath(pathname: string): { path: string; params: string[] } {
  const params: string[] = [];
  const segs = pathname.split("/").map((seg, i, all) => {
    const explicit = /^\{([A-Za-z_][\w]*)(?::[^}]*)?\}$/.exec(decodeURIComponent(seg));
    if (explicit?.[1]) {
      params.push(explicit[1]);
      return `{${explicit[1]}}`;
    }
    if (ID_SEGMENT.test(seg)) {
      const prev = all[i - 1] ?? "";
      const base = prev.replace(/s$/, "").replace(/[^A-Za-z0-9]/g, "") || "resource";
      const name = unique(`${base}Id`, params);
      params.push(name);
      return `{${name}}`;
    }
    return seg;
  });
  return { path: segs.join("/"), params };
}

function unique(name: string, taken: string[]): string {
  let n = name;
  let i = 2;
  while (taken.includes(n)) n = `${name}${i++}`;
  return n;
}

/** Expands `{name:example}` placeholders in a seed URL into a concrete URL + template. */
export function expandSeed(seed: string): { url: string; template?: string } {
  if (!/\{[A-Za-z_]\w*(:[^}]*)?\}/.test(seed)) return { url: seed };
  const template = seed.replace(/\{([A-Za-z_]\w*)(?::[^}]*)?\}/g, "{$1}");
  const url = seed.replace(/\{([A-Za-z_]\w*)(?::([^}]*))?\}/g, (_m, name: string, ex?: string) => encodeURIComponent(ex ?? name));
  return { url, template };
}

export function classifyParam(name: string): ParamInfo["role"] {
  const n = name.toLowerCase();
  if (/^(page|p|pg|offset|start|skip|cursor|after|before|next|page_?token|limit|per_?page|page_?size|size|count|take|first|last|max_?results|rows)$/.test(n))
    return "pagination";
  if (/^(sort|order|order_?by|sort_?by|direction|dir)$/.test(n)) return "sort";
  if (/^(q|query|search|term|keyword|keywords|s)$/.test(n)) return "search";
  if (/(^id$|_id$|Id$|^ids$|slug|uuid)/.test(name)) return "identifier";
  return "filter";
}

export class EndpointInventory {
  private byKey = new Map<string, EndpointRecord>();

  get all(): EndpointRecord[] {
    return [...this.byKey.values()];
  }

  get(id: string): EndpointRecord | undefined {
    return this.all.find((e) => e.id === id);
  }

  add(o: EndpointObservation): EndpointRecord {
    const u = new URL(o.url);
    const explicit = o.template ? new URL(o.template.replace(/\{/g, "%7B").replace(/\}/g, "%7D")) : undefined;
    const { path, params } = templatePath(explicit ? decodeURIComponent(explicit.pathname) : u.pathname);
    const method = o.method.toUpperCase();
    // Placeholder names differ between sources ({id} in a spec, {param} in JS): key on the shape only.
    const key = `${method} ${u.origin}${path.replace(/\{[^}]*\}/g, "{}")}`;
    const id = `${method.toLowerCase()}-${createHash("sha1").update(key).digest("hex").slice(0, 8)}`;
    const queryNames = new Set([...(o.queryParamNames ?? []), ...u.searchParams.keys()]);

    let rec = this.byKey.get(key);
    if (!rec) {
      rec = {
        id,
        method,
        urlTemplate: `${u.origin}${path}`,
        exampleUrl: redactUrl(o.url),
        origin: u.origin,
        discoveredBy: [],
        evidenceIds: [],
        purpose: o.purpose ?? guessPurpose(method, path),
        pathParams: params,
        queryParams: [],
        requiredHeaders: [],
        auth: "unknown",
        responseFormat: o.responseFormat ?? "unknown",
        filters: [],
        errorsObserved: [],
        status: o.status,
        testStatus: "not-tested",
        confidence: o.confidence ?? defaultConfidence(o.status),
        documented: o.documented ?? false,
        goalRelevance: 0,
        notes: [],
      };
      this.byKey.set(key, rec);
    } else if (STATUS_RANK[o.status] > STATUS_RANK[rec.status]) {
      rec.status = o.status;
      rec.confidence = o.confidence ?? defaultConfidence(o.status);
      rec.exampleUrl = redactUrl(o.url);
    } else if (o.status === rec.status && u.search && !new URL(rec.exampleUrl).search) {
      rec.exampleUrl = redactUrl(o.url);
    }
    if (o.purpose && o.documented) rec.purpose = o.purpose;
    if (o.documented && params.length && rec.pathParams.join() !== params.join()) {
      // Prefer the parameter names declared by official documentation.
      rec.pathParams = params;
      rec.urlTemplate = `${u.origin}${path}`;
    }
    if (!rec.discoveredBy.includes(o.strategy)) rec.discoveredBy.push(o.strategy);
    if (!rec.evidenceIds.includes(o.evidenceId)) rec.evidenceIds.push(o.evidenceId);
    if (o.documented) rec.documented = true;
    if (o.responseFormat && o.responseFormat !== "unknown") rec.responseFormat = o.responseFormat;
    if (o.contentType) rec.contentType = o.contentType;
    if (o.bodyFormat) rec.bodyFormat = o.bodyFormat;
    for (const h of o.requiredHeaders ?? []) if (!rec.requiredHeaders.includes(h)) rec.requiredHeaders.push(h);
    for (const name of queryNames) {
      if (rec.queryParams.some((p) => p.name === name)) continue;
      const sensitive = isSensitiveName(name);
      const raw = sensitive ? undefined : (u.searchParams.get(name) ?? undefined);
      const example = raw && !/[{}]/.test(raw) ? raw : undefined;
      rec.queryParams.push({ name, example: example || undefined, role: classifyParam(name), sensitive: sensitive || undefined });
    }
    rec.filters = rec.queryParams.filter((p) => p.role === "filter" || p.role === "search").map((p) => p.name);
    if (o.httpStatus !== undefined && o.httpStatus >= 400) {
      rec.errorsObserved.push({ status: o.httpStatus, at: new Date().toISOString(), note: o.note });
      if (o.httpStatus === 401 || o.httpStatus === 403) {
        rec.auth = "required";
        rec.authEvidence = `HTTP ${o.httpStatus} via ${o.strategy}`;
      }
    } else if (o.httpStatus !== undefined && o.httpStatus < 300 && rec.auth === "unknown" && o.strategy === "verify") {
      rec.auth = "none";
    }
    if (o.note && !rec.notes.includes(o.note)) rec.notes.push(o.note);
    return rec;
  }
}

function defaultConfidence(s: EndpointStatus): Confidence {
  return s === "confirmed" ? "high" : s === "observed" ? "medium" : "low";
}

function guessPurpose(method: string, path: string): string {
  const segs = path.split("/").filter((s) => s && !/^\{/.test(s) && !/^(api|v\d+|rest|public|graphql|json)$/i.test(s));
  const resource = segs.at(-1) ?? "resource";
  const params = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  if (method !== "GET") return `${method} ${resource} (inferred from URL shape)`;
  return params.length
    ? `Read one ${resource} by ${params.join(", ")} (inferred from URL shape)`
    : `List/read ${resource} (inferred from URL shape)`;
}
