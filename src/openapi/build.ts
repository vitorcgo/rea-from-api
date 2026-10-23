// Builds an OpenAPI 3.1 document from an investigation. This is the
// interchange artifact: it feeds Schemathesis, Spectral, Prism, oasdiff and any
// client generator. Only confirmed/observed/documented operations become paths;
// weaker candidates are listed under `x-rea-from-api-candidates`.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EndpointRecord, Investigation, JsonSchema } from "../core/types.ts";
import { trimSample } from "../generate/typescript.ts";
import { pathExamples } from "../plan/planner.ts";

export interface OpenApiDoc {
  openapi: "3.1.0";
  info: { title: string; version: string; description: string };
  servers: { url: string }[];
  paths: Record<string, Record<string, unknown>>;
  components: { securitySchemes?: Record<string, unknown> };
  "x-rea-from-api": Record<string, unknown>;
  "x-rea-from-api-candidates": unknown[];
}

/** JsonSchema (ours) → JSON Schema 2020-12 as used by OpenAPI 3.1. */
export function toJsonSchema(s: JsonSchema | undefined, depth = 0): Record<string, unknown> {
  if (!s || depth > 20) return {};
  let out: Record<string, unknown>;
  if (s.anyOf?.length) out = { anyOf: s.anyOf.map((x) => toJsonSchema(x, depth + 1)) };
  else if (s.type === "unknown") out = {};
  else if (s.type === "object") {
    out = { type: "object" };
    if (s.additionalProperties) out.additionalProperties = toJsonSchema(s.additionalProperties, depth + 1);
    else {
      const props: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(s.properties ?? {})) props[k] = toJsonSchema(v, depth + 1);
      out.properties = props;
      if (s.required?.length) out.required = s.required;
    }
  } else if (s.type === "array") out = { type: "array", items: toJsonSchema(s.items, depth + 1) };
  else out = { type: s.type };
  if (s.format) out.format = s.format;
  if (s.nullable && typeof out.type === "string" && out.type !== "null") out.type = [out.type, "null"];
  else if (s.nullable && !out.type) out = { anyOf: [out, { type: "null" }] };
  return out;
}

const INCLUDED = new Set(["confirmed", "observed"]);

export function buildOpenApi(inv: Investigation, investigationDir?: string): OpenApiDoc {
  const included = inv.endpoints.filter((e) => INCLUDED.has(e.status) || (e.documented && e.status !== "unavailable"));
  const main = new URL(inv.input.url).origin;
  // Other origins get path-level `servers` overrides (see below).
  const servers = [{ url: main }];
  const doc: OpenApiDoc = {
    openapi: "3.1.0",
    info: {
      title: `${new URL(inv.input.url).hostname} (observed by rea-from-api)`,
      version: inv.finishedAt?.slice(0, 10) ?? "0",
      description: [
        `Reverse-engineered description of the data interfaces behind ${inv.input.url}.`,
        `Goal: ${inv.input.goal}`,
        "Schemas describe observed responses, not a published contract. Each operation carries `x-rea-from-api` with status, confidence and evidence ids.",
      ].join("\n\n"),
    },
    servers,
    paths: {},
    components: {},
    "x-rea-from-api": { version: inv.tool.version, investigatedAt: inv.finishedAt, appType: inv.appType, limitations: inv.limitations },
    "x-rea-from-api-candidates": [],
  };
  const usedIds = new Set<string>();
  for (const e of included) {
    const pathKey = pathOf(e);
    const item = (doc.paths[pathKey] ??= {});
    if (e.origin !== main) item.servers = [{ url: e.origin }];
    item[e.method.toLowerCase()] = operation(e, usedIds, investigationDir);
    if (e.auth === "required") doc.components.securitySchemes = { observedAuth: { type: "http", scheme: "bearer", description: "Authentication was required when verified (401/403/login redirect). Scheme not observed; adjust to the provider's documentation." } };
  }
  doc["x-rea-from-api-candidates"] = inv.endpoints
    .filter((e) => !included.includes(e))
    .map((e) => ({ method: e.method, url: e.urlTemplate, status: e.status, testStatus: e.testStatus, evidenceIds: e.evidenceIds, notes: e.notes }));
  return doc;
}

function pathOf(e: EndpointRecord): string {
  const rest = e.urlTemplate.slice(e.origin.length) || "/";
  return rest.startsWith("/") ? rest : `/${rest}`;
}

function operation(e: EndpointRecord, used: Set<string>, dir?: string): Record<string, unknown> {
  let opId = `${e.method.toLowerCase()}_${pathOf(e).replace(/\{([^}]+)\}/g, "by_$1").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}` || e.id;
  while (used.has(opId)) opId += "_";
  used.add(opId);
  const params: Record<string, unknown>[] = [
    ...e.pathParams.map((p) => {
      const ex = pathExamples(e.urlTemplate, e.exampleUrl)[p];
      return { name: p, in: "path", required: true, schema: { type: "string" }, ...(ex !== undefined ? { example: ex } : {}) };
    }),
    ...e.queryParams.map((q) => {
      // Prefer the value actually used in the verified request; never emit template placeholders.
      const fromExample = safeSearchParam(e.exampleUrl, q.name);
      const ex = [fromExample, q.example].find((v) => v !== undefined && v !== "" && !/[{}]|%7B/i.test(v));
      return { name: q.name, in: "query", required: false, schema: { type: "string" }, ...(ex !== undefined && !q.sensitive ? { example: ex } : {}), "x-role": q.role };
    }),
  ];
  const content: Record<string, unknown> = {};
  const media = e.responseFormat === "json" ? "application/json" : e.responseFormat === "html" ? "text/html" : e.responseFormat === "xml" ? "application/xml" : (e.contentType?.split(";")[0] ?? "*/*");
  const sample = dir ? loadSample(dir, e.id) : undefined;
  content[media] = {
    schema: e.responseFormat === "json" ? toJsonSchema(e.schema) : { type: "string" },
    ...(sample !== undefined ? { example: trimSample(sample, 0, 3) } : {}),
  };
  const responses: Record<string, unknown> = {
    "200": { description: e.status === "confirmed" ? "Observed successful response" : "Expected response (not replayed)", content },
  };
  for (const err of e.errorsObserved) responses[String(err.status)] ??= { description: `Observed ${err.status}${err.note ? `: ${err.note}` : ""}` };
  const op: Record<string, unknown> = {
    operationId: opId,
    summary: e.purpose,
    parameters: params,
    responses,
    "x-rea-from-api": {
      id: e.id,
      status: e.status,
      testStatus: e.testStatus,
      confidence: e.confidence,
      documented: e.documented,
      discoveredBy: e.discoveredBy,
      evidenceIds: e.evidenceIds,
      verifiedAt: e.verifiedAt,
      goalRelevance: e.goalRelevance,
      ...(e.pagination ? { pagination: e.pagination } : {}),
      ...(e.rateLimit ? { rateLimitHeaders: e.rateLimit } : {}),
      ...(e.requiredHeaders.length ? { headerNames: e.requiredHeaders } : {}),
    },
  };
  if (e.auth === "required") op.security = [{ observedAuth: [] }];
  return op;
}

function safeSearchParam(url: string, name: string): string | undefined {
  try {
    return new URL(url).searchParams.get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

function loadSample(dir: string, id: string): unknown {
  const p = join(dir, "investigation", "samples", `endpoint-${id}.json`);
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return undefined;
  }
}
