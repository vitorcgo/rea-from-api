// Operations shared by the CLI and the MCP server, so both surfaces have the
// same contracts (REA's model). Everything returns data; nothing prints.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { investigate, type InvestigateOptions } from "./investigate.ts";
import { buildPlan, writePlan, type IntegrationPlan, type PlanOptions } from "./plan/planner.ts";
import { generateTypeScript, writeFiles } from "./generate/typescript.ts";
import { generatePython } from "./generate/python.ts";
import { validateIntegration, type ValidationReport } from "./validate.ts";
import { buildOpenApi, type OpenApiDoc } from "./openapi/build.ts";
import { runConformance, type ConformanceResult } from "./conformance.ts";
import { driftReport, renderDrift, type DriftReport } from "./drift.ts";
import type { EndpointRecord, EvidenceRecord, Investigation, InvestigationInput } from "./core/types.ts";

export function loadInvestigation(dir: string): Investigation {
  const p = join(resolve(dir), "investigation", "investigation.json");
  if (!existsSync(p)) throw new Error(`no investigation at ${p} — run investigate first`);
  return JSON.parse(readFileSync(p, "utf8")) as Investigation;
}

export function loadEvidence(dir: string): EvidenceRecord[] {
  const p = join(resolve(dir), "investigation", "evidence.json");
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as EvidenceRecord[]) : [];
}

export async function runInvestigation(input: InvestigationInput, opts: InvestigateOptions = {}): Promise<Investigation> {
  mkdirSync(input.outDir, { recursive: true });
  return investigate(input, opts);
}

export function summarize(inv: Investigation, dir: string) {
  const count = (s: string) => inv.endpoints.filter((e) => e.status === s).length;
  return {
    dir,
    url: inv.input.url,
    appType: inv.appType,
    tech: inv.tech.map((t) => t.name),
    counts: { confirmed: count("confirmed"), observed: count("observed"), inferred: count("inferred"), unavailable: count("unavailable"), embedded: inv.embedded.length },
    recommended: inv.endpoints
      .filter((e) => e.status === "confirmed" && e.responseFormat === "json")
      .slice(0, 8)
      .map((e) => ({ id: e.id, method: e.method, url: e.urlTemplate, relevance: e.goalRelevance, documented: e.documented, pagination: e.pagination?.style })),
    strategies: inv.strategies.map((s) => ({ id: s.id, status: s.status, detail: s.detail })),
    limitations: inv.limitations,
    budget: inv.budget,
    files: {
      findings: join(dir, "investigation", "findings.md"),
      openapi: join(dir, "investigation", "openapi.json"),
      endpoints: join(dir, "investigation", "endpoints.json"),
      evidence: join(dir, "investigation", "evidence.json"),
    },
  };
}

export function listEndpoints(dir: string, filter: { status?: string; method?: string; query?: string; limit?: number } = {}) {
  const inv = loadInvestigation(dir);
  return inv.endpoints
    .filter((e) => (!filter.status || e.status === filter.status) && (!filter.method || e.method === filter.method.toUpperCase()) && (!filter.query || e.urlTemplate.toLowerCase().includes(filter.query.toLowerCase())))
    .slice(0, filter.limit ?? 50)
    .map((e) => ({ id: e.id, method: e.method, url: e.urlTemplate, status: e.status, test: e.testStatus, confidence: e.confidence, relevance: e.goalRelevance, documented: e.documented, auth: e.auth, format: e.responseFormat }));
}

export function getEndpoint(dir: string, id: string): { endpoint: EndpointRecord; evidence: EvidenceRecord[] } {
  const inv = loadInvestigation(dir);
  const endpoint = inv.endpoints.find((e) => e.id === id);
  if (!endpoint) throw new Error(`unknown endpoint ${id}`);
  const ev = loadEvidence(dir).filter((e) => endpoint.evidenceIds.includes(e.id));
  return { endpoint, evidence: ev };
}

export function exportOpenApi(dir: string, out?: string): { file: string; doc: OpenApiDoc } {
  const abs = resolve(dir);
  const doc = buildOpenApi(loadInvestigation(abs), abs);
  const file = out ? resolve(out) : join(abs, "investigation", "openapi.json");
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  return { file, doc };
}

export function planIntegration(dir: string, opts: PlanOptions & { target?: string; language?: "typescript" | "python" } = {}): IntegrationPlan {
  const abs = resolve(dir);
  const inv = loadInvestigation(abs);
  if (opts.target) inv.input.targetProject = resolve(opts.target);
  const plan = buildPlan(inv, opts);
  if (opts.language) plan.language = opts.language;
  else if (plan.target.kind === "python") plan.language = "python";
  writePlan(abs, plan);
  return plan;
}

export function readPlan(dir: string): IntegrationPlan {
  const p = join(resolve(dir), "architecture", "plan.json");
  if (!existsSync(p)) throw new Error("no plan — run plan first");
  return JSON.parse(readFileSync(p, "utf8")) as IntegrationPlan;
}

export function integrationPath(dir: string, plan: IntegrationPlan): string {
  return plan.target.root ? join(plan.target.root, plan.target.integrationDir) : join(resolve(dir), plan.target.integrationDir);
}

export function generateIntegration(dir: string, opts: { force?: boolean } = {}): { out: string; written: string[]; conflicts: string[]; language: string } {
  const plan = readPlan(dir);
  const out = integrationPath(dir, plan);
  const standalone = plan.target.kind === "none" || plan.target.kind === "other";
  const files =
    plan.language === "python"
      ? generatePython(plan, { investigationDir: resolve(dir), outDir: out, standalone })
      : generateTypeScript(plan, { investigationDir: resolve(dir), outDir: out, standalone });
  const r = writeFiles(files, out, opts.force);
  return { out, ...r, language: plan.language };
}

export async function validate(integrationDir: string, opts: { live?: boolean; reportDir?: string } = {}): Promise<ValidationReport> {
  return validateIntegration(integrationDir, opts);
}

export async function conformance(dir: string, opts: { baseUrl?: string; maxExamples?: number; maxTimeSec?: number; rateLimit?: string } = {}): Promise<ConformanceResult & { file: string }> {
  const abs = resolve(dir);
  const doc = buildOpenApi(loadInvestigation(abs), abs);
  const reportDir = join(abs, "conformance");
  const r = await runConformance(doc, { ...opts, reportDir, auth: loadInvestigation(abs).input.auth });
  const fence = "`".repeat(3);
  const md = [`# Conformance (Schemathesis) — ${r.status.toUpperCase()}`, "", `${r.operations} confirmed GET operations · positive inputs · rate limited`, "", r.command ? `Command: ${r.command}` : "", "", fence, r.output.replaceAll(fence, "'''"), fence, ""].join("\n");
  mkdirSync(reportDir, { recursive: true });
  const file = join(reportDir, "conformance.md");
  writeFileSync(file, md);
  return { ...r, file };
}

export function loadSpec(p: string): OpenApiDoc {
  const abs = resolve(p);
  const file = existsSync(join(abs, "investigation", "openapi.json")) ? join(abs, "investigation", "openapi.json") : abs;
  return JSON.parse(readFileSync(file, "utf8")) as OpenApiDoc;
}

export async function diffSpecs(a: string, b: string): Promise<DriftReport & { markdown: string }> {
  const r = await driftReport(loadSpec(a), loadSpec(b));
  return { ...r, markdown: renderDrift(r, a, b) };
}

export async function monitor(dir: string, opts: { browser?: "auto" | "rea" | "off"; maxRequests?: number; echo?: boolean } = {}): Promise<DriftReport & { markdown: string; file: string }> {
  const abs = resolve(dir);
  const prev = loadInvestigation(abs);
  const out = join(abs, "monitor", new Date().toISOString().replace(/[:.]/g, "-"));
  const inv = await investigate(
    { ...prev.input, outDir: out, seeds: prev.input.seeds ?? [], allowCrossOrigin: prev.input.allowCrossOrigin ?? [], browser: opts.browser ?? prev.input.browser },
    { echo: opts.echo, limits: { maxRequests: opts.maxRequests } },
  );
  const r = await driftReport(buildOpenApi(prev, abs), buildOpenApi(inv, out));
  const markdown = renderDrift(r, prev.finishedAt ?? "baseline", inv.finishedAt ?? "now");
  const file = join(out, "drift.md");
  writeFileSync(file, markdown);
  return { ...r, markdown, file };
}
