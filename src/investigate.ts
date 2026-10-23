// Orchestrates strategies, persists the investigation and renders findings.md.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SafeHttp, BudgetExceeded } from "./core/http.ts";
import { EndpointInventory, EvidenceStore } from "./core/inventory.ts";
import { ProgressLog } from "./core/progress.ts";
import { resolveLimits, type Limits } from "./core/limits.ts";
import type { Investigation, InvestigationInput, StrategyRun } from "./core/types.ts";
import { selectStrategies } from "./strategies/index.ts";
import type { InvestigationContext } from "./strategies/types.ts";
import { renderFindings } from "./report.ts";
import { VERSION } from "./version.ts";
import { trimSample } from "./generate/typescript.ts";
import { buildOpenApi } from "./openapi/build.ts";

export interface InvestigateOptions {
  limits?: Partial<Limits>;
  only?: string[];
  skip?: string[];
  echo?: boolean;
}

/** Strategies that work without contacting the target's own host. */
const OFF_TARGET = new Set(["passive-sources", "api-hosts", "seeds", "har", "verify"]);

export async function investigate(input: InvestigationInput, opts: InvestigateOptions = {}): Promise<Investigation> {
  const target = new URL(input.url);
  if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("only http(s) URLs are supported");
  if (target.username || target.password) throw new Error("URLs with embedded credentials are rejected");

  const invDir = join(input.outDir, "investigation");
  const samplesDir = join(invDir, "samples");
  mkdirSync(samplesDir, { recursive: true });
  const limits = resolveLimits(opts.limits ?? {});
  const log = new ProgressLog(join(invDir, "progress.jsonl"), opts.echo);
  const http = new SafeHttp(limits, log);
  const allowed = new Set([target.origin, ...input.allowCrossOrigin.map((o) => new URL(o).origin)]);

  if (input.auth) http.useCredential(input.auth, allowed);

  const ctx: InvestigationContext = {
    input,
    limits,
    http,
    evidence: new EvidenceStore(),
    inventory: new EndpointInventory(),
    log,
    tech: [],
    embedded: [],
    limitations: [],
    samples: new Map(),
    allowedOrigins: allowed,
    appType: "unknown",
    saveSample(name, data) {
      const file = `${name.replace(/[^\w.-]+/g, "_").slice(0, 80)}.json`;
      writeFileSync(join(samplesDir, file), `${JSON.stringify(data, null, 2)}\n`);
      return `samples/${file}`;
    },
  };

  const startedAt = new Date().toISOString();
  log.event("start", { url: input.url, goal: input.goal, limits });
  const runs: StrategyRun[] = [];
  for (const s of selectStrategies(opts.only, opts.skip)) {
    const t0 = Date.now();
    const skip = ctx.targetBlocked && !OFF_TARGET.has(s.id) ? `target blocked (${ctx.targetBlocked}); not contacted again` : await s.skip?.(ctx);
    if (skip) {
      runs.push({ id: s.id, status: /not found|No Chromium|failed to start|install/i.test(skip) ? "unavailable" : "skipped", detail: skip, durationMs: 0 });
      log.event("strategy-skipped", { id: s.id, reason: skip });
      continue;
    }
    log.event("strategy-start", { id: s.id });
    try {
      const r = await s.run(ctx);
      runs.push({ id: s.id, ...r, durationMs: Date.now() - t0 });
      log.event("strategy-done", { id: s.id, status: r.status, detail: r.detail });
      // A challenged target is never retried, but its official API may live on another host.
      if (r.status === "failed" && s.id === "html-static" && http.stoppedHosts.size) ctx.targetBlocked = [...http.stoppedHosts.values()][0];
    } catch (e) {
      const msg = (e as Error).message.split("\n")[0] ?? "error";
      runs.push({ id: s.id, status: e instanceof BudgetExceeded ? "partial" : "failed", detail: msg, durationMs: Date.now() - t0 });
      log.event("strategy-failed", { id: s.id, error: msg });
      if (e instanceof BudgetExceeded && s.id !== "verify") ctx.limitations.push(`${s.id}: ${msg}`);
    }
  }
  for (const [host, why] of http.stoppedHosts) ctx.limitations.push(`Stopped contacting ${host}: ${why}.`);

  // Persist samples per endpoint (redacted) and link them from evidence.
  for (const [id, s] of ctx.samples) {
    // Retained samples are excerpts (arrays/maps cut to 50 entries); evidence sha256 covers the full bytes.
    const rel = ctx.saveSample(`endpoint-${id}`, trimSample(s.body, 0, 50));
    const ep = ctx.inventory.get(id);
    const ev = ep && ctx.evidence.items.find((e) => ep.evidenceIds.includes(e.id) && (e.kind === "verification" || e.kind === "browser-capture" || e.kind === "http-response" || e.kind === "har"));
    if (ev) ev.samplePath = rel;
  }

  const inv: Investigation = {
    tool: { name: "rea-from-api", version: VERSION },
    input: { url: input.url, goal: input.goal, targetProject: input.targetProject, seeds: input.seeds, harPath: input.harPath, browser: input.browser, allowCrossOrigin: input.allowCrossOrigin, robotsExempt: input.robotsExempt, passive: input.passive, auth: input.auth },
    startedAt,
    finishedAt: new Date().toISOString(),
    appType: ctx.appType,
    tech: ctx.tech,
    endpoints: ctx.inventory.all.sort((a, b) => b.goalRelevance - a.goalRelevance || a.urlTemplate.localeCompare(b.urlTemplate)),
    embedded: ctx.embedded,
    strategies: runs,
    limitations: [...new Set(ctx.limitations)],
    budget: { requestsUsed: http.requestsUsed, requestLimit: limits.maxRequests, elapsedMs: http.elapsedMs() },
  };
  writeFileSync(join(invDir, "investigation.json"), `${JSON.stringify(inv, null, 2)}\n`);
  writeFileSync(join(invDir, "endpoints.json"), `${JSON.stringify(inv.endpoints, null, 2)}\n`);
  writeFileSync(join(invDir, "evidence.json"), `${JSON.stringify(ctx.evidence.items, null, 2)}\n`);
  writeFileSync(join(invDir, "findings.md"), renderFindings(inv, ctx.evidence.items));
  writeFileSync(join(invDir, "openapi.json"), `${JSON.stringify(buildOpenApi(inv, input.outDir), null, 2)}\n`);
  log.event("done", { endpoints: inv.endpoints.length, requests: http.requestsUsed });
  return inv;
}
