// Property-based conformance testing of the observed API with Schemathesis
// (optional external engine). Only confirmed GET operations are exercised,
// with valid ("positive") inputs, a rate limit and a time budget: the goal is
// to prove the reverse-engineered contract holds beyond the recorded samples,
// not to fuzz someone else's service.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OpenApiDoc } from "./openapi/build.ts";
import { findTool, runTool, TOOLS } from "./providers/external.ts";

export interface ConformanceOptions {
  baseUrl?: string;
  maxExamples?: number;
  rateLimit?: string;
  maxTimeSec?: number;
  reportDir: string;
}

export interface ConformanceResult {
  status: "passed" | "failed" | "skipped";
  operations: number;
  command?: string;
  output: string;
  reportDir?: string;
}

/** Keeps only confirmed, read-only operations. */
export function confirmedGetSpec(doc: OpenApiDoc): OpenApiDoc {
  const paths: OpenApiDoc["paths"] = {};
  for (const [p, item] of Object.entries(doc.paths)) {
    const get = item.get as { "x-rea-from-api"?: { status?: string } } | undefined;
    if (get?.["x-rea-from-api"]?.status !== "confirmed") continue;
    const kept: Record<string, unknown> = { get };
    if (item.servers) kept.servers = item.servers;
    paths[p] = kept;
  }
  return { ...doc, paths };
}

export async function runConformance(doc: OpenApiDoc, o: ConformanceOptions): Promise<ConformanceResult> {
  const bin = findTool("schemathesis");
  const spec = confirmedGetSpec(doc);
  const operations = Object.keys(spec.paths).length;
  if (!bin) return { status: "skipped", operations, output: `Schemathesis not installed (${TOOLS.schemathesis!.install})` };
  if (!operations) return { status: "skipped", operations, output: "no confirmed GET operations to test" };
  const dir = mkdtempSync(join(tmpdir(), "rfa-st-"));
  mkdirSync(o.reportDir, { recursive: true });
  try {
    const file = join(dir, "openapi.json");
    writeFileSync(file, JSON.stringify(spec));
    const args = [
      "run",
      file,
      "--url",
      o.baseUrl ?? doc.servers[0]!.url,
      "--include-method",
      "GET",
      "--mode",
      "positive",
      "--phases",
      "examples,fuzzing",
      "--checks",
      "not_a_server_error,content_type_conformance,response_schema_conformance",
      "--max-examples",
      String(o.maxExamples ?? 8),
      "--rate-limit",
      o.rateLimit ?? "2/s",
      "--workers",
      "1",
      "--max-time",
      String(o.maxTimeSec ?? 120),
      "--request-timeout",
      "15",
      "--report",
      "junit",
      "--report-dir",
      o.reportDir,
      "--no-color",
    ];
    if (process.env.REQUESTS_CA_BUNDLE || process.env.SSL_CERT_FILE) args.push("--tls-verify", (process.env.REQUESTS_CA_BUNDLE ?? process.env.SSL_CERT_FILE)!);
    const r = await runTool(bin, args, ((o.maxTimeSec ?? 120) + 60) * 1000);
    const output = `${r.stdout}${r.stderr}`.trim();
    return {
      status: r.code === 0 ? "passed" : "failed",
      operations,
      command: [bin, ...args].join(" "),
      output: output.length > 8000 ? `${output.slice(0, 2000)}\n…\n${output.slice(-6000)}` : output,
      reportDir: o.reportDir,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
