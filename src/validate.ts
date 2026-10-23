// Validates a generated integration: typecheck, offline tests (recorded
// fixtures), optional live smoke tests and the usage example. Records results
// to validation.json / validation.md; never reports success without output.

import { spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { IS_WINDOWS, commandFor, findOnPath, packageDir } from "./core/platform.ts";

export interface CheckResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  command?: string;
  durationMs: number;
  output: string;
}

export interface ValidationReport {
  integrationDir: string;
  at: string;
  live: boolean;
  checks: CheckResult[];
  ok: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));

/** Async on purpose: the validated code may call servers living in this same process (tests). */
function runCheck(name: string, cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}, timeoutMs = 180_000): Promise<CheckResult> {
  const t0 = Date.now();
  return new Promise((resolvePromise) => {
    const c = commandFor(cmd);
    const child = spawn(c.cmd, [...c.pre, ...args], { cwd, env: childEnv(env), stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    const timer = setTimeout(() => {
      output += `\n[killed after ${timeoutMs} ms]`;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.on("error", (e) => (output += String(e)));
    child.on("close", (code) => {
      clearTimeout(timer);
      const out = output.trim();
      resolvePromise({
        name,
        status: code === 0 ? "passed" : "failed",
        command: [cmd, ...args].join(" "),
        durationMs: Date.now() - t0,
        output: out.length > 6000 ? `${out.slice(0, 3000)}\n…\n${out.slice(-3000)}` : out,
      });
    });
  });
}

/** Where @types/node lives for this install (checkout or hoisted npm install). */
function typeRoots(): string[] {
  const nodeTypes = packageDir("@types/node");
  return nodeTypes ? [dirname(nodeTypes)] : [resolve(here, "../node_modules/@types")];
}

function findTsc(integrationDir: string): string | undefined {
  // The package's JS entry (run through node) works everywhere; .bin shims are .cmd on Windows.
  const own = packageDir("typescript");
  for (const p of [join(integrationDir, "node_modules/typescript/bin/tsc"), own && join(own, "bin", "tsc")]) if (p && existsSync(p)) return p;
  return undefined;
}

export async function validateIntegration(integrationDir: string, opts: { live?: boolean; reportDir?: string } = {}): Promise<ValidationReport> {
  const dir = resolve(integrationDir);
  if (existsSync(join(dir, "tests", "test_models.py"))) return finish(dir, await validatePython(dir, !!opts.live), opts);
  const checks: CheckResult[] = [];
  const node = process.execPath;

  const tsc = findTsc(dir);
  if (tsc) {
    let project = join(dir, "tsconfig.json");
    let tmp: string | undefined;
    // Use the integration's own config only when its dependencies are installed.
    if (!existsSync(project) || !existsSync(join(dir, "node_modules/@types/node"))) {
      tmp = mkdtempSync(join(tmpdir(), "rfa-tsc-"));
      project = join(tmp, "tsconfig.json");
      writeFileSync(
        project,
        JSON.stringify({
          compilerOptions: { target: "ES2023", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, allowImportingTsExtensions: true, verbatimModuleSyntax: true, skipLibCheck: true, types: ["node"], typeRoots: typeRoots() },
          include: [join(dir, "src"), join(dir, "tests"), join(dir, "examples")],
        }),
      );
    }
    checks.push(await runCheck("typecheck", tsc, ["-p", project], dir));
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  } else checks.push({ name: "typecheck", status: "skipped", durationMs: 0, output: "TypeScript compiler not found (npm install in rea-from-api or the integration)" });

  const offline = ["tests/schemas.test.ts", "tests/client.test.ts"].filter((f) => existsSync(join(dir, f)));
  checks.push(await runCheck("offline tests (recorded fixtures)", node, ["--test", ...offline], dir));

  if (opts.live) {
    checks.push(await runCheck("live smoke tests", node, ["--test", "tests/live.test.ts"], dir, { LIVE: "1" }));
    if (existsSync(join(dir, "examples/basic.ts"))) checks.push(await runCheck("usage example", node, ["examples/basic.ts"], dir, {}, 120_000));
  } else {
    checks.push({ name: "live smoke tests", status: "skipped", durationMs: 0, output: "not requested (--live)" });
    checks.push({ name: "usage example", status: "skipped", durationMs: 0, output: "runs against the live source; enable with --live" });
  }

  return finish(dir, checks, opts);
}

function finish(dir: string, checks: CheckResult[], opts: { live?: boolean; reportDir?: string }): ValidationReport {
  const report: ValidationReport = { integrationDir: dir, at: new Date().toISOString(), live: !!opts.live, checks, ok: checks.every((c) => c.status !== "failed") };
  const outDir = opts.reportDir ?? dir;
  writeFileSync(join(outDir, "validation.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outDir, "validation.md"), renderValidation(report));
  return report;
}

function findPython(): string {
  // The user's PATH first (virtualenv, pyenv, setup-python); system interpreters only as a fallback.
  const env = process.env.REA_FROM_API_PYTHON;
  if (env && existsSync(env)) return env;
  return findOnPath(IS_WINDOWS ? ["python", "py", "python3"] : ["python3", "python"]) ?? ["/usr/bin/python3", "/usr/local/bin/python3"].find((c) => existsSync(c)) ?? "python3";
}

async function validatePython(dir: string, live: boolean): Promise<CheckResult[]> {
  const py = findPython();
  const checks: CheckResult[] = [];
  checks.push(await runCheck("byte-compile (python)", py, ["-m", "compileall", "-q", "."], dir));
  const mypy = await runCheck("typecheck (mypy, optional)", py, ["-m", "mypy", "--version"], dir);
  if (mypy.status === "passed") checks.push(await runCheck("typecheck (mypy)", py, ["-m", "mypy", "--ignore-missing-imports", "--no-error-summary", "."], dir));
  else checks.push({ name: "typecheck (mypy)", status: "skipped", durationMs: 0, output: "mypy not installed (pip install mypy)" });
  checks.push(await runCheck("offline tests (recorded fixtures)", py, ["-m", "unittest", "tests.test_models", "tests.test_client", "-v"], dir));
  if (live) {
    checks.push(await runCheck("live smoke tests", py, ["-m", "unittest", "tests.test_live", "-v"], dir, { LIVE: "1" }));
    checks.push(await runCheck("usage example", py, ["examples/basic.py"], dir, {}, 120_000));
  } else {
    checks.push({ name: "live smoke tests", status: "skipped", durationMs: 0, output: "not requested (--live)" });
    checks.push({ name: "usage example", status: "skipped", durationMs: 0, output: "runs against the live source; enable with --live" });
  }
  return checks;
}

export function renderValidation(r: ValidationReport): string {
  const L = [`# Validation — ${r.ok ? "PASSED" : "FAILED"}`, "", `Integration: \`${r.integrationDir}\` · ${r.at} · live: ${r.live}`, "", "| Check | Status | ms |", "|---|---|---|"];
  for (const c of r.checks) L.push(`| ${c.name} | ${c.status} | ${c.durationMs} |`);
  L.push("");
  for (const c of r.checks) {
    if (!c.output) continue;
    L.push(`## ${c.name}`, "", c.command ? `\`${c.command}\`` : "", "", "```", c.output.replace(/```/g, "'''"), "```", "");
  }
  return L.join("\n");
}

/**
 * Child environment for checks. NODE_TEST_CONTEXT must not leak from a parent
 * `node --test` run: with it, the child `node --test` silently skips its files.
 */
function childEnv(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
}
