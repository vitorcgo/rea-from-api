// Drift detection between two OpenAPI documents produced by rea-from-api (or
// any OpenAPI). Built-in structural diff; uses oasdiff's breaking-change
// classifier as well when it is installed.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findTool, runTool } from "./providers/external.ts";

export interface DriftChange {
  level: "breaking" | "warning" | "info";
  path: string;
  message: string;
}

export interface DriftReport {
  changes: DriftChange[];
  breaking: number;
  oasdiff?: { available: boolean; output: string };
}

type Doc = { paths?: Record<string, Record<string, unknown>> };
type Schema = Record<string, unknown> & { type?: unknown; properties?: Record<string, Schema>; items?: Schema; required?: string[]; additionalProperties?: Schema };

const METHODS = ["get", "post", "put", "patch", "delete", "head"];

export function diffOpenApi(before: Doc, after: Doc): DriftChange[] {
  const out: DriftChange[] = [];
  const a = before.paths ?? {};
  const b = after.paths ?? {};
  for (const [p, item] of Object.entries(a)) {
    for (const m of METHODS) {
      if (!item[m]) continue;
      const loc = `${m.toUpperCase()} ${p}`;
      const next = b[p]?.[m];
      if (!next) {
        out.push({ level: "breaking", path: loc, message: "operation no longer present" });
        continue;
      }
      const sa = responseSchema(item[m]);
      const sb = responseSchema(next);
      if (sa && sb) diffSchema(sa, sb, `${loc} response`, out);
      const pa = paramNames(item[m]);
      const pb = paramNames(next);
      for (const n of pa) if (!pb.has(n)) out.push({ level: "warning", path: loc, message: `parameter "${n}" no longer observed/documented` });
      for (const n of pb) if (!pa.has(n)) out.push({ level: "info", path: loc, message: `new parameter "${n}"` });
    }
  }
  for (const [p, item] of Object.entries(b)) for (const m of METHODS) if (item[m] && !a[p]?.[m]) out.push({ level: "info", path: `${m.toUpperCase()} ${p}`, message: "new operation" });
  return out;
}

function responseSchema(op: unknown): Schema | undefined {
  const content = (op as { responses?: Record<string, { content?: Record<string, { schema?: Schema }> }> }).responses?.["200"]?.content;
  return content?.["application/json"]?.schema;
}

function paramNames(op: unknown): Set<string> {
  return new Set(((op as { parameters?: { name: string; in: string }[] }).parameters ?? []).map((p) => `${p.in}:${p.name}`));
}

const typeOf = (s: Schema): string => (Array.isArray(s.type) ? (s.type as string[]).filter((t) => t !== "null").join("|") : String(s.type ?? "any"));
const nullable = (s: Schema): boolean => Array.isArray(s.type) && (s.type as string[]).includes("null");

function diffSchema(a: Schema, b: Schema, path: string, out: DriftChange[], depth = 0): void {
  if (depth > 12) return;
  const ta = typeOf(a);
  const tb = typeOf(b);
  if (ta !== "any" && tb !== "any" && ta !== tb && !(ta === "integer" && tb === "number")) {
    out.push({ level: "breaking", path, message: `type changed ${ta} → ${tb}` });
    return;
  }
  if (!nullable(a) && nullable(b)) out.push({ level: "warning", path, message: "became nullable" });
  if (a.items && b.items) diffSchema(a.items, b.items, `${path}[]`, out, depth + 1);
  if (a.additionalProperties && b.additionalProperties) diffSchema(a.additionalProperties, b.additionalProperties, `${path}.*`, out, depth + 1);
  const pa = a.properties ?? {};
  const pb = b.properties ?? {};
  const reqB = new Set(b.required ?? []);
  for (const [k, v] of Object.entries(pa)) {
    if (!(k in pb)) out.push({ level: (a.required ?? []).includes(k) ? "breaking" : "warning", path: `${path}.${k}`, message: "field removed" });
    else {
      if ((a.required ?? []).includes(k) && !reqB.has(k)) out.push({ level: "warning", path: `${path}.${k}`, message: "no longer always present" });
      diffSchema(v, pb[k]!, `${path}.${k}`, out, depth + 1);
    }
  }
  for (const k of Object.keys(pb)) if (!(k in pa)) out.push({ level: "info", path: `${path}.${k}`, message: "new field" });
}

export async function driftReport(before: Doc, after: Doc): Promise<DriftReport> {
  const changes = diffOpenApi(before, after);
  const report: DriftReport = { changes, breaking: changes.filter((c) => c.level === "breaking").length };
  const bin = findTool("oasdiff");
  if (bin) {
    const dir = mkdtempSync(join(tmpdir(), "rfa-oasdiff-"));
    try {
      writeFileSync(join(dir, "a.json"), JSON.stringify(before));
      writeFileSync(join(dir, "b.json"), JSON.stringify(after));
      const r = await runTool(bin, ["breaking", join(dir, "a.json"), join(dir, "b.json"), "--format", "text"], 60_000);
      report.oasdiff = { available: true, output: `${r.stdout}${r.stderr}`.trim().slice(0, 6000) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } else report.oasdiff = { available: false, output: "oasdiff not installed (go install github.com/oasdiff/oasdiff@latest)" };
  return report;
}

export function renderDrift(r: DriftReport, labelA: string, labelB: string): string {
  const L = [`# Drift: ${labelA} → ${labelB}`, "", `**${r.breaking} breaking**, ${r.changes.filter((c) => c.level === "warning").length} warnings, ${r.changes.filter((c) => c.level === "info").length} info`, ""];
  if (r.changes.length) {
    L.push("| Level | Where | Change |", "|---|---|---|");
    for (const c of r.changes) L.push(`| ${c.level} | \`${c.path}\` | ${c.message} |`);
  } else L.push("No structural changes in observed operations.");
  if (r.oasdiff) L.push("", "## oasdiff", "", r.oasdiff.available ? `\`\`\`\n${r.oasdiff.output || "no breaking changes"}\n\`\`\`` : r.oasdiff.output);
  return `${L.join("\n")}\n`;
}
