// Benchmark: runs `investigate` on every site in sites.json with no hints (no seeds,
// no HAR, no key) and summarizes what a new user would get on the first try.
// Usage: node benchmark/run.mjs [--only id,id] [--parallel N] [--browser auto|off] [--out DIR] [--summarize]
// --summarize rebuilds results.json from a previous run without sending requests.
// --robots-documented adds `--robots-exempt documented` (the explicit opt-in) and writes results-documented.json.
// With --only, the other sites keep their previous results.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "bin", "rea-from-api.mjs");
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const only = opt("only", "")?.split(",").filter(Boolean) ?? [];
const parallel = Number(opt("parallel", "3"));
const browser = opt("browser", "auto");
const robotsDocumented = args.includes("--robots-documented");
const outRoot = opt("out", join(here, "..", ".rea-from-api", robotsDocumented ? "benchmark-documented" : "benchmark"));
const resultsFile = join(here, robotsDocumented ? "results-documented.json" : "results.json");
const sites = JSON.parse(readFileSync(join(here, "sites.json"), "utf8")).filter((s) => !only.length || only.includes(s.id));

// Same rule `plan` uses to pick sources: a confirmed JSON GET relevant to the goal.
const MIN_RELEVANCE = 0.3;

function runOne(site) {
  const out = join(outRoot, site.id);
  mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  return new Promise((resolve) => {
    const extra = robotsDocumented ? ["--robots-exempt", "documented"] : [];
    const child = spawn(process.execPath, [cli, "investigate", site.url, "--goal", site.goal, "--out", out, "--browser", browser, "--quiet", "--max-duration-ms", "240000", ...extra], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.stdout.resume();
    child.on("close", (code) => resolve(summarize(site, out, code, Date.now() - t0, stderr)));
  });
}

function summarize(site, out, code, ms, stderr) {
  const file = join(out, "investigation", "investigation.json");
  if (!existsSync(file)) return { ...site, exit: code, seconds: Math.round(ms / 1000), error: stderr.trim().split("\n").slice(-3).join(" ").slice(0, 300) };
  const inv = JSON.parse(readFileSync(file, "utf8"));
  const eps = inv.endpoints ?? [];
  const count = (s) => eps.filter((e) => e.status === s).length;
  const usable = eps.filter((e) => e.status === "confirmed" && e.method === "GET" && e.responseFormat === "json" && e.goalRelevance >= MIN_RELEVANCE);
  const blocked = (inv.limitations ?? []).find((l) => /challenge|captcha|anti-bot|blocked/i.test(l));
  return {
    ...site,
    exit: code,
    seconds: Math.round((ms || inv.budget?.elapsedMs || 0) / 1000),
    appType: inv.appType,
    confirmed: count("confirmed"),
    observed: count("observed"),
    inferred: count("inferred"),
    usable: usable.length,
    documented: usable.filter((e) => e.documented).length,
    robotsOnly: eps.filter((e) => e.testStatus === "skipped-robots" && e.method === "GET" && e.documented).length,
    pageRobots: /robots/i.test((inv.strategies ?? []).find((s) => s.id === "html-static")?.detail ?? ""),
    needsKey: eps.filter((e) => e.auth === "required" && e.documented).length,
    best: usable.slice(0, 3).map((e) => e.urlTemplate),
    requests: inv.budget?.requestsUsed,
    strategies: Object.fromEntries((inv.strategies ?? []).map((s) => [s.id, s.status])),
    blocked: blocked ? blocked.slice(0, 160) : undefined,
  };
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
      const r = results[i];
      console.log(`${r.id.padEnd(14)} ${r.usable ? "usable " + r.usable : r.error ? "error" : "nothing"}  (${r.seconds}s)`);
    }
  }));
  return results;
}

const summarizeOnly = args.includes("--summarize");
const fresh = summarizeOnly
  ? sites.map((s) => summarize(s, join(outRoot, s.id), null, 0, "not run"))
  : await pool(sites, parallel, runOne);
const previous = only.length && existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, "utf8")).results : [];
const all = JSON.parse(readFileSync(join(here, "sites.json"), "utf8"));
const results = only.length
  ? all.map((s) => fresh.find((r) => r.id === s.id) ?? previous.find((r) => r.id === s.id)).filter(Boolean)
  : fresh;
const ok = results.filter((r) => r.usable > 0).length;
const report = { tool: JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")).version, at: new Date().toISOString(), browser, robotsExempt: robotsDocumented ? "documented" : undefined, sites: results.length, usable: ok, results };
writeFileSync(resultsFile, JSON.stringify(report, null, 2) + "\n");
console.log(`\n${ok}/${results.length} sites gave at least one usable endpoint`);
