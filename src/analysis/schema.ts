// Infers a JSON-Schema-like shape from observed samples and merges shapes
// across samples. Only what was seen is described; nothing is invented.

import type { JsonSchema } from "../core/types.ts";

const MAX_DEPTH = 12;
const MAX_ARRAY_SAMPLES = 50;

export function inferSchema(value: unknown, depth = 0): JsonSchema {
  if (depth > MAX_DEPTH) return { type: "unknown", samples: 1 };
  if (value === null) return { type: "null", samples: 1 };
  if (Array.isArray(value)) {
    let items: JsonSchema | undefined;
    for (const v of value.slice(0, MAX_ARRAY_SAMPLES)) {
      const s = inferSchema(v, depth + 1);
      items = items ? mergeSchemas(items, s) : s;
    }
    return { type: "array", items: items ?? { type: "unknown", samples: 0 }, samples: 1 };
  }
  switch (typeof value) {
    case "string":
      return withFormat({ type: "string", samples: 1 }, value);
    case "number":
      return { type: Number.isInteger(value) ? "integer" : "number", samples: 1 };
    case "boolean":
      return { type: "boolean", samples: 1 };
    case "object": {
      const entries = Object.entries(value as Record<string, unknown>);
      if (looksLikeMap(entries.map(([k]) => k))) {
        let values: JsonSchema | undefined;
        for (const [, v] of entries.slice(0, MAX_ARRAY_SAMPLES * 4)) {
          const s = inferSchema(v, depth + 1);
          values = values ? mergeSchemas(values, s) : s;
        }
        return { type: "object", additionalProperties: values ?? { type: "unknown", samples: 0 }, samples: 1 };
      }
      const properties: Record<string, JsonSchema> = {};
      for (const [k, v] of entries) properties[k] = inferSchema(v, depth + 1);
      return { type: "object", properties, required: Object.keys(properties), samples: 1 };
    }
    default:
      return { type: "unknown", samples: 1 };
  }
}

/** Keys that are data (versions, numeric ids, dates, hashes) rather than field names. */
export function looksLikeMap(keys: string[]): boolean {
  if (keys.length < 4) return false;
  const dataKey = (k: string) => /^\d/.test(k) || /^[0-9a-f]{8,}$/i.test(k) || /^v?\d+(\.\d+)+/.test(k) || /^[0-9a-f-]{36}$/i.test(k);
  const ratio = keys.filter(dataKey).length / keys.length;
  return ratio >= 0.8 || keys.length >= 200;
}

function withFormat(s: JsonSchema, v: string): JsonSchema {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(v)) s.format = "date-time";
  else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) s.format = "date";
  else if (/^https?:\/\/\S+$/.test(v)) s.format = "uri";
  else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) s.format = "uuid";
  else if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) s.format = "email";
  return s;
}

export function mergeSchemas(a: JsonSchema, b: JsonSchema): JsonSchema {
  const samples = (a.samples ?? 1) + (b.samples ?? 1);
  if (a.type === "null" && b.type !== "null") return { ...b, nullable: true, samples };
  if (b.type === "null" && a.type !== "null") return { ...a, nullable: true, samples };
  if ((a.type === "integer" && b.type === "number") || (a.type === "number" && b.type === "integer"))
    return { type: "number", nullable: a.nullable || b.nullable || undefined, samples };
  if (a.type === "unknown" && a.samples === 0) return b;
  if (b.type === "unknown" && b.samples === 0) return a;
  if (a.type !== b.type) {
    const variants = [...(a.anyOf ?? [stripAny(a)]), ...(b.anyOf ?? [stripAny(b)])];
    const dedup: JsonSchema[] = [];
    for (const v of variants) {
      const i = dedup.findIndex((d) => d.type === v.type);
      if (i >= 0) dedup[i] = mergeSchemas(dedup[i]!, v);
      else dedup.push(v);
    }
    return { type: "unknown", anyOf: dedup, nullable: a.nullable || b.nullable || undefined, samples };
  }
  const out: JsonSchema = { type: a.type, samples };
  if (a.nullable || b.nullable) out.nullable = true;
  if (a.format && a.format === b.format) out.format = a.format;
  if (a.type === "array") out.items = mergeSchemas(a.items ?? { type: "unknown", samples: 0 }, b.items ?? { type: "unknown", samples: 0 });
  if (a.type === "object" && (a.additionalProperties || b.additionalProperties)) {
    const vals = [a.additionalProperties, b.additionalProperties, ...Object.values(a.properties ?? {}), ...Object.values(b.properties ?? {})].filter(
      (x): x is JsonSchema => !!x,
    );
    out.additionalProperties = vals.reduce((acc, v) => mergeSchemas(acc, v));
    return out;
  }
  if (a.type === "object") {
    const props: Record<string, JsonSchema> = {};
    const keys = new Set([...Object.keys(a.properties ?? {}), ...Object.keys(b.properties ?? {})]);
    for (const k of keys) {
      const pa = a.properties?.[k];
      const pb = b.properties?.[k];
      props[k] = pa && pb ? mergeSchemas(pa, pb) : (pa ?? pb)!;
    }
    out.properties = props;
    const reqA = new Set(a.required ?? []);
    out.required = (b.required ?? []).filter((k) => reqA.has(k));
  }
  return out;
}

function stripAny(s: JsonSchema): JsonSchema {
  const { anyOf: _a, ...rest } = s;
  return rest;
}

/** Finds the main array of records inside a response (e.g. `items`, `data.results`). */
export function findItemsPath(value: unknown): { path: string; items: unknown[] } | undefined {
  if (Array.isArray(value)) return { path: "", items: value };
  if (!value || typeof value !== "object") return undefined;
  let best: { path: string; items: unknown[] } | undefined;
  const visit = (v: unknown, path: string, depth: number) => {
    if (depth > 3 || !v || typeof v !== "object" || Array.isArray(v)) return;
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k;
      if (Array.isArray(child) && child.some((c) => c && typeof c === "object" && !Array.isArray(c))) {
        if (!best || child.length > best.items.length) best = { path: p, items: child };
      } else visit(child, p, depth + 1);
    }
  };
  visit(value, "", 0);
  return best;
}

export function getPath(value: unknown, path: string): unknown {
  if (!path) return value;
  let cur: unknown = value;
  for (const k of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Field paths of a schema (for goal matching and docs). */
export function fieldNames(s: JsonSchema | undefined, prefix = "", depth = 0, out: string[] = []): string[] {
  if (!s || depth > 4) return out;
  if (s.type === "array") return fieldNames(s.items, prefix, depth + 1, out);
  if (s.additionalProperties) return fieldNames(s.additionalProperties, prefix ? `${prefix}.*` : "*", depth + 1, out);
  for (const [k, v] of Object.entries(s.properties ?? {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    out.push(p);
    fieldNames(v, p, depth + 1, out);
  }
  return out;
}
