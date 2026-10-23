// JsonSchema → TypeScript type declarations and dependency-free runtime
// validators. Validators check the *observed* contract: required keys and
// primitive types. Optional (not always present) keys are checked when present.

import type { JsonSchema } from "../core/types.ts";

const IDENT = /^[A-Za-z_$][\w$]*$/;
const key = (k: string) => (IDENT.test(k) ? k : JSON.stringify(k));

export function tsType(s: JsonSchema | undefined, indent = ""): string {
  if (!s) return "unknown";
  const base = (() => {
    if (s.anyOf?.length) return s.anyOf.map((v) => tsType(v, indent)).join(" | ");
    switch (s.type) {
      case "string":
        return "string";
      case "number":
      case "integer":
        return "number";
      case "boolean":
        return "boolean";
      case "null":
        return "null";
      case "array": {
        const inner = tsType(s.items, indent);
        return /[|&]/.test(inner) && !inner.trim().startsWith("{") ? `Array<${inner}>` : `${inner}[]`;
      }
      case "object": {
        if (s.additionalProperties) return `Record<string, ${tsType(s.additionalProperties, indent)}>`;
        const props = Object.entries(s.properties ?? {});
        if (!props.length) return "Record<string, unknown>";
        const req = new Set(s.required ?? []);
        const inner = `${indent}  `;
        return `{\n${props.map(([k, v]) => `${inner}${key(k)}${req.has(k) ? "" : "?"}: ${tsType(v, inner)};`).join("\n")}\n${indent}}`;
      }
      default:
        return "unknown";
    }
  })();
  return s.nullable && s.type !== "null" ? `${base} | null` : base;
}

export function schemaToTs(name: string, s: JsonSchema | undefined): string {
  return `export type ${name} = ${tsType(s)};`;
}

/**
 * Emits `validate<Name>(value): <Name>` which throws ValidationError with the
 * JSON path of the first mismatch. Depth-limited to keep generated code small.
 */
export function schemaToValidator(name: string, s: JsonSchema | undefined): string {
  const body = check(s, "value", "$", 0);
  return `export function validate${name}(value: unknown): ${name} {\n${body || "  // no observed schema: accepted as-is\n"}  return value as ${name};\n}`;
}

function check(s: JsonSchema | undefined, expr: string, path: string, depth: number): string {
  if (!s || depth > 4 || s.type === "unknown") return "";
  const pad = "  ".repeat(depth + 1);
  const p = JSON.stringify(path);
  let out = "";
  const guard = s.nullable ? `${expr} !== null && ` : "";
  switch (s.type) {
    case "string":
    case "boolean":
      out += `${pad}if (${guard}typeof ${expr} !== "${s.type}") fail(${p}, "${s.type}", ${expr});\n`;
      break;
    case "number":
    case "integer":
      out += `${pad}if (${guard}typeof ${expr} !== "number") fail(${p}, "number", ${expr});\n`;
      break;
    case "null":
      break;
    case "array": {
      out += `${pad}if (${guard}!Array.isArray(${expr})) fail(${p}, "array", ${expr});\n`;
      const inner = check(s.items, `item${depth}`, `${path}[]`, depth + 1);
      if (inner) out += `${pad}if (Array.isArray(${expr})) for (const item${depth} of ${expr} as unknown[]) {\n${inner}${pad}}\n`;
      break;
    }
    case "object": {
      out += `${pad}if (${guard}!isObject(${expr})) fail(${p}, "object", ${expr});\n`;
      if (s.additionalProperties) {
        const inner = check(s.additionalProperties, `entry${depth}`, `${path}.*`, depth + 1);
        if (inner) out += `${pad}if (isObject(${expr})) for (const entry${depth} of Object.values(${expr} as Record<string, unknown>)) {\n${inner}${pad}}\n`;
        break;
      }
      const req = new Set(s.required ?? []);
      const parts: string[] = [];
      for (const [k, v] of Object.entries(s.properties ?? {})) {
        const child = `(${expr} as Record<string, unknown>)[${JSON.stringify(k)}]`;
        const sub = check(v, child, `${path}.${k}`, depth + 1);
        if (req.has(k)) {
          parts.push(`${pad}  if (!(${JSON.stringify(k)} in (${expr} as object))) fail(${JSON.stringify(`${path}.${k}`)}, "present", undefined);\n`);
          if (sub) parts.push(sub.replace(/^(?=.)/gm, "  "));
        } else if (sub) {
          parts.push(`${pad}  if (${child} !== undefined) {\n${sub.replace(/^(?=.)/gm, "  ")}${pad}  }\n`);
        }
      }
      if (parts.length) out += `${pad}if (isObject(${expr})) {\n${parts.join("")}${pad}}\n`;
      break;
    }
  }
  return out;
}
