// Turns benchmark/results.json (and an optional baseline) into benchmark/RESULTS.md.
// Usage: node benchmark/report.mjs [--baseline benchmark/baseline.json]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const bi = args.indexOf("--baseline");
const basePath = bi >= 0 ? args[bi + 1] : join(here, "baseline.json");
const cur = JSON.parse(readFileSync(join(here, "results.json"), "utf8"));
const base = existsSync(basePath) ? JSON.parse(readFileSync(basePath, "utf8")) : undefined;
const before = new Map((base?.results ?? []).map((r) => [r.id, r]));

/** One word for what a first-time user gets from the site. */
function outcome(r) {
  if (r.usable > 0) return "usable";
  if (r.pageRobots) return "robots";
  if (r.blocked) return "blocked";
  if (r.needsKey > 0) return "key";
  if (r.robotsOnly > 0) return "robots";
  if (r.confirmed > 1 || r.observed > 0) return "partial";
  return "nothing";
}
const LABEL = { usable: "usable API", key: "needs your key", robots: "found, robots.txt", blocked: "blocked (anti-bot)", partial: "partial", nothing: "nothing" };

const host = (u) => {
  try {
    const x = new URL(u);
    return x.host + x.pathname;
  } catch {
    return u;
  }
};

const rows = cur.results.map((r) => {
  const b = before.get(r.id);
  const delta = b ? `${b.usable ?? 0} → ${r.usable ?? 0}` : String(r.usable ?? 0);
  return `| ${r.id} | ${r.kind} | ${LABEL[outcome(r)]} | ${base ? delta : r.usable ?? 0} | ${r.confirmed ?? 0} | ${r.seconds}s | ${(r.best ?? []).slice(0, 2).map((u) => "`" + host(u) + "`").join("<br>")} |`;
});
const count = (list, o) => list.filter((r) => outcome(r) === o).length;
const lines = [
  "# Benchmark",
  "",
  `rea-from-api ${cur.tool}, ${cur.at.slice(0, 10)}, browser ${cur.browser}. Each site gets only its URL and a goal: no seeds, no HAR, no key.`,
  "**Usable** = endpoints that `plan` would turn into code: confirmed by a real GET, JSON, relevant to the goal.",
  "",
  `**${cur.usable}/${cur.sites} sites** gave at least one usable endpoint${base ? ` (before this round: ${base.usable}/${base.sites})` : ""}.`,
  "",
  "| Outcome | Sites |",
  "|---|---|",
  ...["usable", "key", "robots", "partial", "blocked", "nothing"].map((o) => `| ${LABEL[o]} | ${count(cur.results, o)}${base ? ` (was ${count(base.results, o)})` : ""} |`),
  "",
  `| Site | Kind | Outcome | Usable${base ? " (before → after)" : ""} | Confirmed | Time | Best endpoints |`,
  "|---|---|---|---|---|---|---|",
  ...rows,
  "",
  "Outcomes: *found, robots.txt* means the API was found and documented but the site's robots.txt asks crawlers not to call it;",
  "it is verified only with an explicit `--robots-exempt`. *Needs your key* means the documented API answers 401/403: run again with `--auth-env`. *Blocked* means a bot challenge stopped the run (never bypassed).",
  "",
  "Reproduce: `node benchmark/run.mjs` (about 15 minutes, a few hundred GET requests spread over the sites), then `node benchmark/report.mjs`.",
  "",
];
writeFileSync(join(here, "RESULTS.md"), lines.join("\n"));
console.log(lines.slice(0, 16).join("\n"));
