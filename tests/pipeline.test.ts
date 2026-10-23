// End-to-end: fixture site → investigate → plan → generate → validate.
// The REA browser strategies run when REA + Chromium are available and are
// skipped (and reported as such) otherwise.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFixtureSite, FIXTURE_API_KEY, type FixtureSite } from "./fixtures/site.ts";
import { readdirSync, statSync } from "node:fs";
import { investigate } from "../src/investigate.ts";
import { buildPlan, writePlan, renderMermaid } from "../src/plan/planner.ts";
import { generateTypeScript, writeFiles } from "../src/generate/typescript.ts";
import { validateIntegration } from "../src/validate.ts";
import { reaAvailability, findChromium } from "../src/rea/reaCli.ts";
import type { Investigation } from "../src/core/types.ts";

let site: FixtureSite;
let work: string;
let inv: Investigation;
const browserAvailable = (await reaAvailability()).available && !!findChromium();

before(async () => {
  site = await startFixtureSite();
  // Passive third-party indexes are served by the fixture (no real internet in tests).
  process.env.REA_FROM_API_APISGURU_URL = `${site.url}/mock/apisguru/v2`;
  process.env.REA_FROM_API_WAYBACK_URL = `${site.url}/mock/wayback`;
  work = mkdtempSync(join(tmpdir(), "rfa-pipeline-"));
});
after(async () => {
  await site.close();
  if (!process.env.KEEP_WORK) rmSync(work, { recursive: true, force: true });
});

const input = (outDir: string, url: string, extra: Partial<Parameters<typeof investigate>[0]> = {}) => ({
  url,
  goal: "Investigue o site e descubra como ele disponibiliza dados públicos de produtos",
  outDir,
  seeds: [],
  browser: "auto" as const,
  allowCrossOrigin: [],
  ...extra,
});

test("investigation discovers, classifies and verifies endpoints", async () => {
  inv = await investigate(input(join(work, "shop"), `${site.url}/`), { limits: { perHostDelayMs: 0, maxRequests: 150 } });
  const by = (tpl: string, method = "GET") => inv.endpoints.find((e) => e.method === method && e.urlTemplate === `${site.url}${tpl}`);

  const list = by("/api/v1/products");
  assert.ok(list, "products list found");
  assert.equal(list.status, "confirmed");
  assert.equal(list.testStatus, "passed");
  assert.equal(list.documented, true, "from the OpenAPI document");
  assert.equal(list.pagination?.style, "page");
  assert.match(list.pagination?.basis ?? "", /second page fetched and differs/);
  assert.equal(list.pagination?.itemsField, "items");
  assert.equal(list.rateLimit?.["x-ratelimit-limit"], "60");
  assert.ok(list.goalRelevance >= 0.5);

  const detail = by("/api/v1/products/{id}");
  assert.equal(detail?.status, "confirmed", "path param filled from an observed list item");
  assert.ok(detail?.notes.some((n) => /filled with "1"/.test(n)));

  assert.equal(by("/api/v1/orders", "POST")?.testStatus, "skipped-unsafe-method", "writes are never replayed");
  assert.equal(by("/api/v1/admin/users")?.testStatus, "skipped-sensitive-path");
  assert.equal(site.hits.get("/private/data"), undefined, "robots-disallowed path never fetched");
  assert.equal(site.hits.get("/api/v1/admin/users") ?? 0, 0, "sensitive route never replayed");

  const strategies = Object.fromEntries(inv.strategies.map((s) => [s.id, s.status]));
  assert.equal(strategies["html-static"], "ok");
  assert.equal(strategies["official-docs"], "ok");
  if (browserAvailable) {
    assert.ok(["ok", "partial"].includes(strategies["rea-browser"]!), "REA browser capture ran");
    assert.ok(list.discoveredBy.includes("rea-browser"), "fetch observed on the wire through REA");
    const evidence = JSON.parse(readFileSync(join(work, "shop", "investigation", "evidence.json"), "utf8")) as { reaEvidenceId?: string }[];
    assert.ok(evidence.some((e) => e.reaEvidenceId?.startsWith("ev_")), "REA evidence ids are linked");
  } else {
    assert.equal(strategies["rea-browser"], "unavailable");
  }

  // Publisher-declared and passive connections
  assert.equal(by("/api/v1/stores")?.status, "confirmed", "RFC 9727 api-catalog → YAML spec → verified");
  assert.ok(by("/api/v1/stores")?.discoveredBy.includes("well-known"));
  assert.ok(list.discoveredBy.includes("passive-sources"), "APIs.guru listing ingested");
  assert.equal(by("/api/v1/legacy-feed.json")?.status, "unavailable", "Wayback candidate replayed and found gone");
  const reviews = by("/api/v1/reviews");
  assert.equal(reviews?.status, "confirmed", "API call recovered from a source map, query placeholder filled from observed data");
  assert.ok(reviews?.notes.some((n) => /\{product\} filled/.test(n)));
  const gql = by("/graphql", "POST");
  assert.equal(gql?.status, "confirmed");
  assert.match(gql?.purpose ?? "", /2 queries \(product, products\)/);
  assert.equal(strategies["graphql"], "ok");
  assert.equal(strategies["well-known"], "ok");

  for (const f of ["findings.md", "endpoints.json", "evidence.json", "investigation.json", "progress.jsonl"])
    assert.ok(existsSync(join(work, "shop", "investigation", f)), f);
  const findings = readFileSync(join(work, "shop", "investigation", "findings.md"), "utf8");
  assert.match(findings, /confirmed by test/);
  assert.doesNotMatch(findings, /should never be fetched/);
  assert.ok(inv.budget.requestsUsed <= inv.budget.requestLimit);
});

test("investigation exports a valid OpenAPI 3.1 document", async () => {
  const { Validator } = await import("@seriousme/openapi-schema-validator");
  const doc = JSON.parse(readFileSync(join(work, "shop", "investigation", "openapi.json"), "utf8"));
  const v = new Validator();
  assert.deepEqual(await v.validate(doc), { valid: true });
  const op = doc.paths["/api/v1/products"].get;
  assert.equal(op["x-rea-from-api"].status, "confirmed");
  assert.equal(op.responses["200"].content["application/json"].schema.properties.items.type, "array");
  assert.ok(doc.paths["/api/v1/products/{id}"].get.parameters.some((p: { in: string }) => p.in === "path"));
  assert.ok(doc["x-rea-from-api-candidates"].some((c: { method: string }) => c.method === "POST"), "writes are candidates, not paths");
});

test("Schemathesis conformance runs on confirmed GET operations (when installed)", async (t) => {
  const { findTool } = await import("../src/providers/external.ts");
  if (!findTool("schemathesis")) return t.skip("schemathesis not installed");
  const { runConformance, confirmedGetSpec } = await import("../src/conformance.ts");
  const { buildOpenApi } = await import("../src/openapi/build.ts");
  const doc = buildOpenApi(inv, join(work, "shop"));
  const only = confirmedGetSpec(doc);
  assert.ok(Object.values(only.paths).every((p) => Object.keys(p).every((k) => k === "get" || k === "servers")), "only GET operations are exercised");
  const r = await runConformance(doc, { maxExamples: 2, rateLimit: "50/s", maxTimeSec: 20, reportDir: join(work, "shop", "conformance") });
  assert.notEqual(r.status, "skipped");
  assert.match(r.output, /API Operations|Selected/);
  // The fixture returns null for page/total_pages on garbage input: a real contract gap the samples never showed.
  if (r.status === "failed") assert.match(r.output, /violates schema|ST10/);
});

test("plan selects confirmed JSON sources, links dependencies, renders Mermaid", () => {
  const plan = buildPlan(inv);
  assert.equal(plan.strategy, "json-api");
  assert.deepEqual(plan.sources.map((s) => s.fnName).sort(), ["getCategories", "getProduct", "getReviews", "getStores", "listProducts"]);
  assert.ok(plan.excluded.some((x) => /GraphQL: schema exported/.test(x.reason)));
  assert.deepEqual(plan.dependencies, [{ from: "listProducts", to: "getProduct", param: "id", field: "id" }]);
  assert.deepEqual(plan.executionOrder.slice(0, 2), ["listProducts", "getProduct"]);
  assert.ok(plan.excluded.some((x) => /write operation|not confirmed/.test(x.reason)));
  const mmd = renderMermaid(plan);
  assert.match(mmd, /^flowchart LR/);
  assert.match(mmd, /fn_listProducts -\. "id → \{id\}" \.-> fn_getProduct/);
  writePlan(join(work, "shop"), plan);
  assert.ok(existsSync(join(work, "shop", "architecture", "data-models.ts")));
});

test("generated integration typechecks and passes its own tests", async () => {
  const plan = buildPlan(inv);
  const out = join(work, "shop", "integration");
  const files = generateTypeScript(plan, { investigationDir: join(work, "shop"), outDir: out, standalone: true });
  assert.ok(files.some((f) => f.path === "src/endpoints.ts"));
  assert.ok(!files.some((f) => /server|database/i.test(f.path)), "no API server or DB is generated");
  writeFiles(files, out);
  const second = writeFiles(files.map((f) => (f.path === "README.md" ? { ...f, content: `${f.content}\nchanged` } : f)), out);
  assert.deepEqual(second.conflicts, ["README.md"], "existing files are never overwritten without --force");
  const report = await validateIntegration(out, { live: true });
  for (const c of report.checks) assert.notEqual(c.status, "failed", `${c.name}:\n${c.output}`);
  assert.ok(report.ok);
});

test("generated Python integration passes its own checks (offline + live)", async () => {
  const { generatePython } = await import("../src/generate/python.ts");
  const plan = { ...buildPlan(inv, { name: "shop-py" }), language: "python" as const };
  const out = join(work, "shop", "integration-py");
  writeFiles(generatePython(plan, { investigationDir: join(work, "shop"), outDir: out, standalone: true }), out);
  const report = await validateIntegration(out, { live: true });
  for (const c of report.checks) assert.notEqual(c.status, "failed", `${c.name}:\n${c.output}`);
  assert.ok(report.checks.some((c) => c.name === "offline tests (recorded fixtures)" && c.status === "passed"));
});

test("setup installs and uninstalls MCP server + skill (project scope)", async () => {
  const { setup, mcpEntry, stripTomlTable, isEphemeralInstall } = await import("../src/setup.ts");
  const proj = join(work, "setup-proj");
  mkdirSync(proj, { recursive: true });
  writeFileSync(join(proj, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));
  const lines: string[] = [];
  const say = (s: string) => lines.push(s);

  assert.equal(await setup({ agents: ["project"], dryRun: true, say, cwd: proj }), 0);
  assert.ok(!JSON.parse(readFileSync(join(proj, ".mcp.json"), "utf8")).mcpServers["rea-from-api"], "dry run changes nothing");

  assert.equal(await setup({ agents: ["project"], yes: true, say, cwd: proj }), 0);
  const cfg = JSON.parse(readFileSync(join(proj, ".mcp.json"), "utf8"));
  assert.ok(cfg.mcpServers.other, "existing servers are kept");
  assert.deepEqual(cfg.mcpServers["rea-from-api"].args.slice(-1), ["mcp"]);
  assert.ok(existsSync(join(proj, ".mcp.json.bak-rea-from-api")), "backup written");
  assert.match(readFileSync(join(proj, ".claude", "skills", "rea-from-api", "SKILL.md"), "utf8"), /^name: rea-from-api/m);

  assert.equal(await setup({ agents: ["project"], yes: true, uninstall: true, say, cwd: proj }), 0);
  assert.ok(!JSON.parse(readFileSync(join(proj, ".mcp.json"), "utf8")).mcpServers["rea-from-api"]);
  assert.ok(!existsSync(join(proj, ".claude", "skills", "rea-from-api")), "skill link removed");
  assert.ok(existsSync(join(import.meta.dirname, "..", "SKILL.md")), "removing the link never deletes the checkout");

  assert.equal(await setup({ agents: ["nope"], say, cwd: proj }), 1);
  assert.equal(stripTomlTable('a = 1\n[mcp_servers.rea-from-api]\ncommand = "x"\n[mcp_servers.rea-from-api.env]\nK = "v"\n[other]\nb = 2\n', "mcp_servers.rea-from-api"), "a = 1\n[other]\nb = 2\n");
  assert.ok(isEphemeralInstall("/home/u/.npm/_npx/abc/node_modules/rea-from-api"));
  assert.deepEqual(mcpEntry("/home/u/.npm/_npx/abc/node_modules/rea-from-api").args.slice(-2), [`rea-from-api@${(await import("../src/version.ts")).VERSION}`, "mcp"]);
});

test("HTML-only page yields an embedded-data integration", async () => {
  const dir = join(work, "catalog");
  // Only the page itself: the fixture also has an OpenAPI doc, which would (correctly) win otherwise.
  const cat = await investigate(input(dir, `${site.url}/catalog`, { browser: "off" }), { only: ["html-static"], limits: { perHostDelayMs: 0 } });
  assert.deepEqual(cat.embedded.map((e) => e.kind).sort(), ["json-ld", "next-data"]);
  assert.ok(cat.tech.some((t) => t.name === "Next.js"));
  const plan = buildPlan(cat);
  assert.equal(plan.strategy, "embedded-json");
  const out = join(dir, "integration");
  writeFiles(generateTypeScript(plan, { investigationDir: dir, outDir: out, standalone: true }), out);
  const report = await validateIntegration(out, { live: true });
  for (const c of report.checks) assert.notEqual(c.status, "failed", `${c.name}:\n${c.output}`);
});

test("framework convention: Next.js data route derived from buildId and verified", async () => {
  const dir = join(work, "next");
  const p = await investigate(input(dir, `${site.url}/catalog`, { browser: "off", passive: false }), { only: ["html-static", "framework-data"], limits: { perHostDelayMs: 0 } });
  const nd = p.endpoints.find((e) => e.urlTemplate === `${site.url}/_next/data/abc/catalog.json`);
  assert.equal(nd?.status, "confirmed");
  assert.ok(nd?.discoveredBy.includes("framework-data"));
  assert.ok(p.tech.some((t) => t.name === "Next.js (pages router)"));
});

test("own API key: blocked without it, confirmed with it, never written anywhere", async () => {
  const url = `${site.url}/`;
  const opts = { only: ["official-docs"], limits: { perHostDelayMs: 0 } };
  const without = await investigate(input(join(work, "nokey"), url, { browser: "off", passive: false }), opts);
  const blocked = without.endpoints.find((e) => e.urlTemplate.endsWith("/api/v1/partner/prices"));
  assert.equal(blocked?.auth, "required");
  assert.notEqual(blocked?.status, "confirmed");
  assert.ok(blocked?.notes.some((n) => /--auth-env/.test(n)), "tells the user how to use their own key");

  process.env.RFA_TEST_PARTNER_KEY = FIXTURE_API_KEY;
  const dir = join(work, "withkey");
  const withKey = await investigate(
    input(dir, url, { browser: "off", passive: false, auth: { envVar: "RFA_TEST_PARTNER_KEY", header: "X-Api-Key" } }),
    opts,
  );
  const ok = withKey.endpoints.find((e) => e.urlTemplate.endsWith("/api/v1/partner/prices"));
  assert.equal(ok?.status, "confirmed");
  assert.equal(ok?.auth, "credential");

  const plan = buildPlan(withKey, { select: [ok!.id], name: "partner" });
  assert.equal(plan.auth.header, "X-Api-Key");
  assert.equal(plan.auth.scheme, "");
  const out = join(dir, "integration");
  writeFiles(generateTypeScript(plan, { investigationDir: dir, outDir: out, standalone: true }), out);
  process.env[plan.auth.envVar!] = FIXTURE_API_KEY;
  const report = await validateIntegration(out, { live: true });
  for (const c of report.checks) assert.notEqual(c.status, "failed", `${c.name}:\n${c.output}`);

  // The key value must not appear in any artifact (investigation, plan, generated code, reports).
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  const leaks = walk(dir).filter((f) => readFileSync(f, "utf8").includes(FIXTURE_API_KEY));
  assert.deepEqual(leaks, []);
  delete process.env.RFA_TEST_PARTNER_KEY;
  delete process.env[plan.auth.envVar!];
});

test("bot challenge stops the investigation without bypass attempts", async () => {
  const dir = join(work, "protected");
  const before = site.hits.get("/protected") ?? 0;
  const p = await investigate(input(dir, `${site.url}/protected`, { browser: "off" }), { limits: { perHostDelayMs: 0 } });
  assert.equal(p.strategies.find((s) => s.id === "html-static")?.status, "failed");
  assert.ok(p.limitations.some((l) => /does not bypass/.test(l)));
  assert.equal((site.hits.get("/protected") ?? 0) - before, 1, "exactly one request, no retries");
  assert.equal(buildPlan(p).strategy, "none");
});

test("request budget is enforced", async () => {
  const dir = join(work, "budget");
  const p = await investigate(input(dir, `${site.url}/`, { browser: "off" }), { limits: { maxRequests: 4, perHostDelayMs: 0 } });
  assert.ok(p.budget.requestsUsed <= 4);
  assert.ok(p.endpoints.some((e) => e.testStatus === "skipped-budget") || p.limitations.some((l) => /budget/i.test(l)));
});
