// The MCP server is exercised with a real MCP client over stdio.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startFixtureSite, type FixtureSite } from "./fixtures/site.ts";

let site: FixtureSite;
let client: Client;
let work: string;

before(async () => {
  site = await startFixtureSite();
  work = mkdtempSync(join(tmpdir(), "rfa-mcp-"));
  client = new Client({ name: "rea-from-api-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(import.meta.dirname, "..", "bin", "rea-from-api.mjs"), "mcp"], stderr: "ignore" }));
});
after(async () => {
  await client.close();
  await site.close();
  rmSync(work, { recursive: true, force: true });
});

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  assert.ok(!r.isError, r.content[0]?.text);
  const text = r.content[0]!.text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

test("MCP lists the same operations as the CLI", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "diff_specs", "doctor", "export_openapi", "generate_integration", "get_endpoint", "investigate", "list_endpoints",
    "monitor", "plan_integration", "read_findings", "run_conformance", "validate_integration",
  ]);
  assert.equal(tools.find((t) => t.name === "list_endpoints")?.annotations?.readOnlyHint, true);
});

test("MCP investigate → list → get_endpoint → plan → generate → validate", async () => {
  const dir = join(work, "shop");
  const summary = await call("investigate", { url: `${site.url}/`, goal: "dados públicos de produtos", out_dir: dir, browser: "off", passive: false, max_requests: 120 });
  assert.ok(summary.counts.confirmed >= 4);
  assert.ok(summary.recommended.some((e: { url: string }) => e.url.endsWith("/api/v1/products")));
  const list = await call("list_endpoints", { dir, status: "confirmed" });
  const products = list.find((e: { url: string }) => e.url.endsWith("/api/v1/products"));
  const detail = await call("get_endpoint", { dir, id: products.id });
  assert.equal(detail.endpoint.pagination.style, "page");
  assert.ok(detail.evidence.length >= 1);
  const findings = await call("read_findings", { dir });
  assert.match(findings, /confirmed by test/);
  const oa = await call("export_openapi", { dir });
  assert.ok(oa.operations.includes("GET /api/v1/products"));
  const plan = await call("plan_integration", { dir, language: "python", name: "shop-py" });
  assert.equal(plan.language, "python");
  assert.match(plan.plan_md, /```mermaid/);
  const gen = await call("generate_integration", { dir });
  assert.equal(gen.conflicts.length, 0);
  const v = await call("validate_integration", { integration_dir: gen.out, live: true });
  assert.ok(v.ok, JSON.stringify(v.checks));
});
