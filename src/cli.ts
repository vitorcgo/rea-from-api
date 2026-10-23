// rea-from-api CLI. A thin layer over src/operations.ts; the MCP server
// (src/mcp/server.ts) exposes the same operations with the same contracts.

import { parseArgs } from "node:util";
import { join, resolve } from "node:path";
import * as ops from "./operations.ts";
import { findChromium, reaAvailability } from "./rea/reaCli.ts";
import { findTool, TOOLS } from "./providers/external.ts";
import { STRATEGIES } from "./strategies/index.ts";
import { VERSION } from "./version.ts";

const HELP = `rea-from-api ${VERSION}: reverse engineer how any website serves its data, prove it with evidence,
and ship a tested client (TypeScript or Python). Powered by REA.

Usage:
  rea-from-api doctor                      check Node, REA, Chromium and optional engines
  rea-from-api setup [--agent A|--all] [--yes] [--dry-run] [--uninstall]
                                           register the MCP server + skill with your agents
                                           (claude-code, claude-desktop, codex, cursor, vscode, windsurf, gemini, project)
  rea-from-api mcp                         run the MCP server (stdio)
  rea-from-api investigate <url> --goal "<text>" [--out DIR] [options]
  rea-from-api endpoints <DIR> [--status S] [--query Q]
  rea-from-api export-openapi <DIR> [--out FILE]
  rea-from-api conformance <DIR> [--base URL] [--max-examples N]   Schemathesis, GET-only
  rea-from-api diff <A> <B>                A/B: investigation dirs or OpenAPI files
  rea-from-api monitor <DIR>               re-verify the API later and report drift
  rea-from-api plan <DIR> [--select id,id] [--name NAME] [--target PROJECT] [--language typescript|python]
  rea-from-api generate <DIR> [--force]
  rea-from-api validate <INTEGRATION_DIR> [--live] [--report DIR]
  rea-from-api run <url> --goal "<text>" [--out DIR] [--target PROJECT] [--language L] [--live] [--fuzz]

Investigation options:
  --out DIR               output directory (default ./.rea-from-api/<host>)
  --seed URL              candidate URL to verify (repeatable). {name:example} marks a path param
  --har FILE              import a HAR you recorded yourself (parsed offline by REA)
  --passive on|off        APIs.guru, Wayback CDX, crt.sh (default on; sends only the domain)
  --browser auto|rea|off  REA browser strategies (default auto: used when REA + Chromium exist)
  --allow-origin ORIGIN   extra origin the verifier may call (repeatable)
  --auth-env VAR          use YOUR OWN key/token from env var VAR for the target's API (never stored)
  --auth-header NAME      send it in this header instead of Authorization (e.g. X-Api-Key)
  --auth-scheme PREFIX    header value prefix (default "Bearer " for Authorization, none otherwise)
  --auth-query NAME       send it as this query parameter instead (e.g. api_key)
  --robots-exempt PREFIX  seed URLs under PREFIX are officially documented APIs: verify them even if
                          robots.txt disallows crawling them (explicit, recorded in evidence)
  --only a,b / --skip a,b select strategies (verify always runs)
  --max-requests N        direct request budget (default 60, max 500)
  --max-duration-ms N     wall-clock budget (default 300000)
  --max-scripts N         JS bundles scanned (default 15)
  --quiet                 no progress on stderr

Strategies: ${STRATEGIES.map((s) => s.id).join(", ")}
Exit codes: 0 ok · 1 error · 2 nothing usable / validation or conformance failed / breaking drift · 3 refused (would overwrite files)
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    goal: { type: "string" },
    out: { type: "string" },
    target: { type: "string" },
    seed: { type: "string", multiple: true },
    har: { type: "string" },
    browser: { type: "string" },
    "allow-origin": { type: "string", multiple: true },
    "robots-exempt": { type: "string", multiple: true },
    passive: { type: "string" },
    "auth-env": { type: "string" },
    "auth-header": { type: "string" },
    "auth-scheme": { type: "string" },
    "auth-query": { type: "string" },
    only: { type: "string" },
    skip: { type: "string" },
    select: { type: "string" },
    name: { type: "string" },
    language: { type: "string" },
    force: { type: "boolean" },
    live: { type: "boolean" },
    fuzz: { type: "boolean" },
    base: { type: "string" },
    status: { type: "string" },
    query: { type: "string" },
    agent: { type: "string", multiple: true },
    "dry-run": { type: "boolean" },
    all: { type: "boolean" },
    yes: { type: "boolean", short: "y" },
    uninstall: { type: "boolean" },
    "max-examples": { type: "string" },
    report: { type: "string" },
    quiet: { type: "boolean" },
    "max-requests": { type: "string" },
    "max-duration-ms": { type: "string" },
    "max-scripts": { type: "string" },
    "max-sources": { type: "string" },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean" },
  },
});

const [cmd, arg] = positionals;
const list = (s?: string) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined);
const num = (s?: string) => (s === undefined ? undefined : Number(s));
const say = (s: string) => process.stdout.write(`${s}\n`);

async function main(): Promise<number> {
  if (values.version) return say(VERSION), 0;
  if (!cmd || values.help || cmd === "help") return say(HELP), 0;
  switch (cmd) {
    case "doctor":
      return doctor();
    case "setup": {
      const { setup } = await import("./setup.ts");
      return setup({ agents: values.agent, all: values.all, yes: values.yes, dryRun: values["dry-run"], uninstall: values.uninstall, say });
    }
    case "mcp": {
      const { startMcpServer } = await import("./mcp/server.ts");
      await startMcpServer();
      return -1;
    }
    case "investigate":
      return (await doInvestigate()).code;
    case "endpoints": {
      for (const e of ops.listEndpoints(requireArg("DIR"), { status: values.status, query: values.query, limit: 200 }))
        say(`${e.id.padEnd(14)} ${e.status.padEnd(11)} ${e.method.padEnd(6)} ${e.url}  (${e.test}, relevance ${e.relevance})`);
      return 0;
    }
    case "export-openapi": {
      const r = ops.exportOpenApi(requireArg("DIR"), values.out);
      say(`OpenAPI 3.1: ${Object.keys(r.doc.paths).length} paths, ${r.doc["x-rea-from-api-candidates"].length} candidates → ${r.file}`);
      return 0;
    }
    case "conformance":
      return doConformance(requireArg("DIR"));
    case "diff": {
      const b = positionals[2];
      if (!b) throw new Error("usage: diff <A> <B>");
      const r = await ops.diffSpecs(requireArg("A"), b);
      say(r.markdown);
      return r.breaking ? 2 : 0;
    }
    case "monitor": {
      const r = await ops.monitor(requireArg("DIR"), { browser: values.browser as "off" | undefined, maxRequests: num(values["max-requests"]), echo: !values.quiet });
      say(r.markdown);
      say(`drift report: ${r.file}`);
      return r.breaking ? 2 : 0;
    }
    case "plan":
      return doPlan(requireArg("DIR"));
    case "generate":
      return doGenerate(requireArg("DIR"));
    case "validate":
      return doValidate(requireArg("INTEGRATION_DIR"), values.report);
    case "run": {
      const r = await doInvestigate();
      if (r.code !== 0) return r.code;
      const p = doPlan(r.dir);
      if (p !== 0) return p;
      const g = doGenerate(r.dir);
      if (g !== 0) return g;
      const v = await doValidate(ops.integrationPath(r.dir, ops.readPlan(r.dir)), r.dir);
      if (values.fuzz) return (await doConformance(r.dir)) || v;
      return v;
    }
    default:
      process.stderr.write(`unknown command ${cmd}\n${HELP}`);
      return 1;
  }
}

function requireArg(what: string): string {
  if (!arg) throw new Error(`missing ${what}`);
  return arg;
}

async function doctor(): Promise<number> {
  const rea = await reaAvailability();
  const chromium = findChromium();
  const [maj, min] = process.versions.node.split(".").map(Number) as [number, number];
  say(`node ${process.versions.node} ${maj > 22 || (maj === 22 && min >= 18) ? "ok" : "TOO OLD (need >= 22.18)"}`);
  say(`REA CLI: ${rea.available ? `ok ${rea.version} (${rea.bin})` : `unavailable: ${rea.reason}`}`);
  say(`Chromium: ${chromium ?? "not found (browser strategies disabled; set REA_FROM_API_CHROMIUM)"}`);
  say(`HTTPS proxy: ${process.env.HTTPS_PROXY || process.env.https_proxy ? "configured (passed to Chromium via wrapper)" : "none"}`);
  for (const t of Object.values(TOOLS)) {
    const bin = findTool(t.id);
    say(`${t.id}: ${bin ? `ok (${bin})` : `optional, not installed: ${t.install}`}  · ${t.purpose}`);
  }
  say(`Strategies: ${STRATEGIES.map((s) => s.id).join(", ")}`);
  return 0;
}

async function doInvestigate(): Promise<{ code: number; dir: string }> {
  const url = requireArg("<url>");
  if (!values.goal) throw new Error("--goal is required (what data do you need?)");
  const out = resolve(values.out ?? join(".rea-from-api", new URL(url).hostname.replace(/[^\w.-]/g, "_")));
  const browser = (values.browser ?? "auto") as "auto" | "rea" | "off";
  const rea = await reaAvailability();
  if (browser === "rea" && !rea.available) throw new Error(`--browser rea requested but ${rea.reason}`);
  const inv = await ops.runInvestigation(
    {
      url,
      goal: values.goal,
      outDir: out,
      targetProject: values.target ? resolve(values.target) : undefined,
      seeds: values.seed ?? [],
      harPath: values.har,
      browser,
      allowCrossOrigin: values["allow-origin"] ?? [],
      robotsExempt: values["robots-exempt"] ?? [],
      passive: values.passive !== "off",
      auth: values["auth-env"]
        ? { envVar: values["auth-env"], header: values["auth-header"], scheme: values["auth-scheme"], query: values["auth-query"] }
        : undefined,
    },
    {
      only: list(values.only),
      skip: list(values.skip),
      echo: !values.quiet,
      limits: { maxRequests: num(values["max-requests"]), maxDurationMs: num(values["max-duration-ms"]), maxScripts: num(values["max-scripts"]) },
    },
  );
  const s = ops.summarize(inv, out);
  say(`\n${s.url}: ${s.appType}`);
  say(`endpoints: ${s.counts.confirmed} confirmed · ${s.counts.observed} observed · ${s.counts.inferred} inferred · ${s.counts.unavailable} unavailable · embedded blocks: ${s.counts.embedded}`);
  for (const e of s.recommended) say(`  ✅ ${e.id}  ${e.method} ${e.url}  (relevance ${e.relevance}${e.pagination ? `, ${e.pagination}` : ""})`);
  for (const st of s.strategies) say(`  [${st.status}] ${st.id}: ${st.detail}`);
  say(`report: ${s.files.findings}\nopenapi: ${s.files.openapi}`);
  const usable = s.recommended.length > 0 || inv.embedded.some((e) => e.schema);
  return { code: usable ? 0 : 2, dir: out };
}

function doPlan(dir: string): number {
  const language = values.language === "python" || values.language === "typescript" ? values.language : undefined;
  const plan = ops.planIntegration(dir, { select: list(values.select), name: values.name, maxSources: num(values["max-sources"]), target: values.target, language });
  say(`plan: ${plan.strategy} (${plan.language}); ${plan.sources.length} API sources, ${plan.embedded.length} embedded sources → ${join(resolve(dir), "architecture")}`);
  for (const s of plan.sources) say(`  ${s.fnName} ← ${s.method} ${s.urlTemplate}`);
  for (const e of plan.embedded) say(`  ${e.fnName} ← ${e.kind} ${e.selector}`);
  for (const n of plan.target.notes) say(`  note: ${n}`);
  if (plan.strategy === "none") {
    say("Nothing confirmed is suitable for code generation. Read investigation/findings.md and consider --seed, --har or --allow-origin.");
    return 2;
  }
  return 0;
}

function doGenerate(dir: string): number {
  const r = ops.generateIntegration(dir, { force: values.force });
  if (r.conflicts.length) {
    say(`Refusing to overwrite ${r.conflicts.length} existing file(s) in ${r.out}:\n${r.conflicts.map((c) => `  ${c}`).join("\n")}\nRe-run with --force after reviewing.`);
    return 3;
  }
  say(`generated ${r.written.length} ${r.language} files in ${r.out}`);
  return 0;
}

async function doValidate(integrationDir: string, reportDir?: string): Promise<number> {
  const r = await ops.validate(integrationDir, { live: values.live, reportDir: reportDir ? resolve(reportDir) : undefined });
  for (const c of r.checks) say(`  [${c.status}] ${c.name}${c.status === "failed" ? `\n${c.output.split("\n").slice(-25).join("\n")}` : ""}`);
  say(`validation ${r.ok ? "PASSED" : "FAILED"} → ${join(reportDir ? resolve(reportDir) : r.integrationDir, "validation.md")}`);
  return r.ok ? 0 : 2;
}

async function doConformance(dir: string): Promise<number> {
  const r = await ops.conformance(dir, { baseUrl: values.base, maxExamples: num(values["max-examples"]) });
  say(`  [${r.status}] conformance (schemathesis): ${r.operations} operations → ${r.file}`);
  if (r.status !== "passed") say(r.output.split("\n").slice(-30).join("\n"));
  return r.status === "failed" ? 2 : 0;
}

main().then(
  (code) => {
    if (code >= 0) process.exit(code);
  },
  (e: Error) => {
    process.stderr.write(`error: ${e.message}\n`);
    process.exit(1);
  },
);
