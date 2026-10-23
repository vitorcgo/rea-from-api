// Adapter around the REA CLI (npm package `rea-agents`, MIT, © morluto).
// rea-from-api never re-implements what REA ships: browser scenario capture,
// static web-bundle analysis and HAR/SAZ inspection are delegated here.
//
// Resolution order: $REA_BIN, the installed rea-agents package entry script
// (run through `node`, so it also works on Windows), `rea` on PATH. When absent every call reports `unavailable` with the install
// command instead of failing the investigation.

import { execFile, spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, rmSync, chmodSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IS_WINDOWS, commandFor, findOnPath } from "../core/platform.ts";

export interface ReaAvailability {
  available: boolean;
  bin?: string;
  version?: string;
  reason?: string;
}

const here = dirname(fileURLToPath(import.meta.url));

export function findReaBin(): string | undefined {
  const candidates = [
    process.env.REA_BIN,
    resolve(here, "../../node_modules/rea-agents/scripts/rea.mjs"),
    resolve(process.cwd(), "node_modules/rea-agents/scripts/rea.mjs"),
  ].filter((c): c is string => !!c);
  for (const c of candidates) if (existsSync(c)) return c;
  return findOnPath(["rea"]);
}

let cached: Promise<ReaAvailability> | undefined;
export function reaAvailability(): Promise<ReaAvailability> {
  cached ??= (async () => {
    const bin = findReaBin();
    if (!bin) return { available: false, reason: "REA CLI not found. Install with `npm install rea-agents@6.7.0` or set REA_BIN." };
    try {
      const out = await run(bin, ["--version"], 30_000);
      return { available: true, bin, version: out.stdout.trim().split(/\s+/).pop() };
    } catch (e) {
      return { available: false, bin, reason: `REA CLI failed to start: ${(e as Error).message}` };
    }
  })();
  return cached;
}

/** Locates a Chromium-family executable (Playwright cache, env, PATH). */
export function findChromium(): string | undefined {
  const env = process.env.REA_FROM_API_CHROMIUM ?? process.env.CHROME_PATH;
  if (env && existsSync(env)) return env;
  const h = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    "/opt/pw-browsers",
    join(h, ".cache/ms-playwright"),
    join(h, "Library/Caches/ms-playwright"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "ms-playwright"),
  ].filter(Boolean) as string[];
  for (const root of roots) {
    try {
      for (const d of readdirSync(root).filter((n: string) => /^chromium-\d+$/.test(n)).sort().reverse()) {
        for (const rel of ["chrome-linux/chrome", "chrome-linux64/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium", "chrome-win/chrome.exe", "chrome-win64/chrome.exe"]) {
          const p = join(root, d, rel);
          if (existsSync(p)) return p;
        }
      }
    } catch {
      /* not present */
    }
  }
  // Installed browsers (Windows / macOS), then PATH.
  const installed = [
    ...[process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]
      .filter((b): b is string => !!b)
      .flatMap((b) => [join(b, "Google/Chrome/Application/chrome.exe"), join(b, "Microsoft/Edge/Application/msedge.exe"), join(b, "Chromium/Application/chrome.exe")]),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];
  for (const p of installed) if (existsSync(p)) return p;
  return findOnPath(["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge"]);
}

/**
 * REA's launch mode has no proxy option. When the environment requires an
 * HTTPS proxy, a tiny wrapper adds --proxy-server; REA still owns the
 * browser lifecycle and profile cleanup.
 */
export function browserExecutableForRea(chromium: string, workDir: string): string {
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const extra: string[] = [];
  if (proxy) extra.push(`--proxy-server=${proxy}`);
  if (process.getuid?.() === 0) extra.push("--no-sandbox");
  // Windows cannot launch a shell script as executable_path; the system proxy settings apply there.
  if (!extra.length || IS_WINDOWS) return chromium;
  const wrapper = join(workDir, "chromium-wrapper.sh");
  writeFileSync(wrapper, `#!/bin/sh\nexec ${shQuote(chromium)} ${extra.map(shQuote).join(" ")} "$@"\n`);
  chmodSync(wrapper, 0o755);
  return wrapper;
}

const shQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export interface ReaRunResult {
  stdout: string;
  stderr: string;
}

export function run(bin: string, args: string[], timeoutMs: number): Promise<ReaRunResult> {
  return new Promise((resolvePromise, reject) => {
    const { cmd, pre } = commandFor(bin);
    execFile(cmd, [...pre, ...args], { timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024, killSignal: "SIGTERM" }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(new Error(`${err.message}\n${String(stderr).slice(0, 2000)}`), { stdout, stderr }));
      else resolvePromise({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** REA Evidence envelope (only the fields rea-from-api reads). */
export interface ReaEvidence<T = unknown> {
  evidence_id: string;
  operation: string;
  normalized_result: T;
  limitations?: string[];
  confidence?: string;
}

export async function reaJson<T>(args: string[], timeoutMs: number): Promise<ReaEvidence<T>> {
  const a = await reaAvailability();
  if (!a.available || !a.bin) throw new Error(a.reason);
  const { stdout } = await run(a.bin, [...args, "--format", "json"], timeoutMs);
  const parsed = JSON.parse(stdout) as ReaEvidence<T>;
  if (!parsed || typeof parsed !== "object" || !("evidence_id" in parsed)) throw new Error("unexpected REA output (no evidence_id)");
  return parsed;
}

// ---- capture-browser-scenario ------------------------------------------------

export interface ReaNetworkEvent {
  sequence: number;
  step_index: number;
  kind: "request" | "response" | "request-finished" | "request-failed" | "network-content" | string;
  transaction_id?: string;
  method?: string;
  url?: { url: string; origin: string | null; query_parameter_names: string[]; redacted: boolean };
  resource_type?: string;
  header_names?: string[];
  status?: number | null;
  failure?: unknown;
  phase?: "request" | "response";
  source_event_sequence?: number;
  body?: { state: string; encoding?: string; content?: string; bytes?: number; sha256?: string; media_type?: string; redacted?: boolean };
}

export interface ReaScenarioResult {
  steps: { step_id: string; status: string; after_url?: { url: string }; artifacts?: Record<string, { state: string; value?: unknown }> }[];
  events: { retained: number; dropped: number; items: ReaNetworkEvent[] };
  completeness?: { status: string };
}

export interface ScenarioOptions {
  url: string;
  settleMs: number;
  executable: string;
  scrollToBottom?: boolean;
  timeoutMs: number;
  maxBodyBytes?: number;
}

export async function captureBrowserScenario(o: ScenarioOptions): Promise<ReaEvidence<ReaScenarioResult>> {
  const dir = mkdtempSync(join(tmpdir(), "rea-from-api-"));
  try {
    const actions: unknown[] = [{ step_id: "settle", action: "wait_for_timeout", duration_ms: o.settleMs }];
    if (o.scrollToBottom)
      actions.push(
        { step_id: "scroll", action: "press", locator: { kind: "css", selector: "body" }, key: "End", timeout_ms: 5000 },
        { step_id: "settle-after-scroll", action: "wait_for_timeout", duration_ms: Math.min(o.settleMs, 2000) },
      );
    const scenario = {
      browser: { mode: "launch", executable_path: browserExecutableForRea(o.executable, dir) },
      start_url: { url: o.url },
      actions,
      capture: {
        at_end: ["url"],
        events: ["network"],
        network: { response_body: true, request_body: true, header_values: false },
        limits: { max_network_body_bytes: o.maxBodyBytes ?? 262_144, max_network_transactions: 400 },
      },
    };
    const file = join(dir, "scenario.json");
    writeFileSync(file, JSON.stringify(scenario));
    return await reaJson<ReaScenarioResult>(["capture-browser-scenario", file], o.timeoutMs);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- analyze-web-bundle (needs a CDP endpoint) -------------------------------

export interface ReaBundleResult {
  capture: { target_url: string; scripts_observed: number; scripts_analyzed: number };
  observations: { routes: unknown[]; endpoints: { value?: string; url?: string; method?: string }[] };
  inferences: { kind: string; value: string; confidence: string; basis: { detector: string; line?: number }[] }[];
  limitations: string[];
}

export async function analyzeWebBundle(url: string, chromium: string, timeoutMs: number): Promise<ReaEvidence<ReaBundleResult>> {
  const dir = mkdtempSync(join(tmpdir(), "rea-from-api-cdp-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const args = [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${join(dir, "profile")}`,
    "--no-first-run",
    ...(proxy ? [`--proxy-server=${proxy}`] : []),
    ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
    url,
  ];
  const child = spawn(chromium, args, { stdio: "ignore" });
  try {
    const endpoint = `http://127.0.0.1:${port}`;
    const targets = await waitForTarget(endpoint, url, 20_000);
    return await reaJson<ReaBundleResult>(["analyze-web-bundle", endpoint, targets, "--observation-ms", "1500"], timeoutMs);
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    rmSync(dir, { recursive: true, force: true });
  }
}

async function waitForTarget(endpoint: string, url: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const wanted = new URL(url).origin;
  while (Date.now() < deadline) {
    try {
      const ev = await reaJson<{ targets: { target_id: string; url: string; origin: string }[] }>(["list-browser-targets", endpoint], 15_000);
      const t = ev.normalized_result.targets.find((x) => x.origin === wanted) ?? ev.normalized_result.targets[0];
      if (t && t.url !== "about:blank") {
        await new Promise((r) => setTimeout(r, 1500));
        return t.target_id;
      }
    } catch {
      /* browser not ready yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("CDP target did not appear in time");
}

// ---- inspect-web-network-capture (HAR / SAZ / mitmproxy) ---------------------

export interface ReaCaptureRecord {
  ordinal?: number;
  request?: { method?: string; url?: string };
  response?: { status?: number; content_type?: string; media_type?: string };
  [k: string]: unknown;
}

export async function inspectHar(path: string, timeoutMs: number): Promise<ReaEvidence<unknown>> {
  return reaJson(["inspect-web-network-capture", resolve(path), "har"], timeoutMs);
}
