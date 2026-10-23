// Generates a TypeScript integration from an IntegrationPlan.
// Only what the plan contains is generated; no server, no database.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { IntegrationPlan, PlanSource, PlanEmbeddedSource } from "../plan/planner.ts";
import { renderMermaid, constName } from "../plan/planner.ts";
import { schemaToTs, schemaToValidator } from "./tsTypes.ts";
import { CACHE_TS, EMBEDDED_TS, ERRORS_TS, HTTP_TS } from "./runtime.ts";
import { redactJson } from "../core/redact.ts";
import { looksLikeMap } from "../analysis/schema.ts";

export interface GenerateOptions {
  /** Directory of the investigation (to read samples). */
  investigationDir: string;
  /** Absolute output directory for the integration. */
  outDir: string;
  /** Overwrite existing files (default false: refuse). */
  force?: boolean;
  standalone: boolean;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export function generateTypeScript(plan: IntegrationPlan, opts: GenerateOptions): GeneratedFile[] {
  if (plan.strategy === "none") throw new Error("plan has no usable sources; nothing to generate (see investigation/findings.md)");
  const files: GeneratedFile[] = [];
  const add = (path: string, content: string) => files.push({ path, content });
  const samples = loadSamples(plan, opts.investigationDir);

  add("src/errors.ts", ERRORS_TS);
  add("src/cache.ts", CACHE_TS);
  add("src/http.ts", HTTP_TS);
  if (plan.embedded.length) add("src/embedded.ts", EMBEDDED_TS);
  add("src/config.ts", configTs(plan));
  add("src/schemas.ts", schemasTs(plan));
  add("src/endpoints.ts", endpointsTs(plan));
  add("src/index.ts", indexTs(plan));
  for (const [fn, data] of samples) add(`tests/fixtures/${fn}.json`, `${JSON.stringify(data, null, 2)}\n`);
  add("tests/schemas.test.ts", schemaTestTs(plan, samples));
  add("tests/client.test.ts", clientTestTs(plan, samples));
  add("tests/live.test.ts", liveTestTs(plan));
  add("examples/basic.ts", exampleTs(plan));
  add("architecture/flow.mmd", renderMermaid(plan));
  add(".env.example", envExample(plan));
  add("README.md", readme(plan, opts.standalone));
  if (opts.standalone) {
    add("package.json", `${JSON.stringify(standalonePackage(plan), null, 2)}\n`);
    add("tsconfig.json", TSCONFIG);
  }
  return files;
}

export function writeFiles(files: GeneratedFile[], outDir: string, force = false): { written: string[]; conflicts: string[] } {
  const conflicts = files.filter((f) => existsSync(join(outDir, f.path)) && readFileSync(join(outDir, f.path), "utf8") !== f.content).map((f) => f.path);
  if (conflicts.length && !force) return { written: [], conflicts };
  const written: string[] = [];
  for (const f of files) {
    const p = join(outDir, f.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.content);
    written.push(relative(process.cwd(), p) || p);
  }
  return { written, conflicts };
}

// ---- pieces ------------------------------------------------------------------

/** Keeps fixtures small: arrays and map-like objects are cut to their first entries. */
export function trimSample(v: unknown, depth = 0, maxItems = 20): unknown {
  if (depth > 30) return v;
  if (Array.isArray(v)) return v.slice(0, maxItems).map((x) => trimSample(x, depth + 1, maxItems));
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    const kept = looksLikeMap(entries.map(([k]) => k)) ? entries.slice(0, maxItems) : entries;
    return Object.fromEntries(kept.map(([k, x]) => [k, trimSample(x, depth + 1, maxItems)]));
  }
  return v;
}

function loadSamples(plan: IntegrationPlan, invDir: string): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const s of plan.sources) {
    const p = join(invDir, "investigation", "samples", `endpoint-${s.endpointId}.json`);
    if (existsSync(p)) out.set(s.fnName, trimSample(redactJson(JSON.parse(readFileSync(p, "utf8")))));
  }
  for (const e of plan.embedded) {
    if (!e.sampleFile) continue;
    const p = join(invDir, "investigation", e.sampleFile);
    if (existsSync(p)) out.set(e.fnName, trimSample(redactJson(JSON.parse(readFileSync(p, "utf8")))));
  }
  return out;
}


function configTs(p: IntegrationPlan): string {
  const env = constName(p.name);
  return `// Runtime configuration. Values come from options or environment variables.
// Secrets are only ever read from the environment; never hard-code them.

export interface Config {
  /** Replaces the origin of every source URL (useful for tests, proxies, staging). */
  baseUrl?: string;
  timeoutMs: number;
  maxRetries: number;
  /** Longest Retry-After the client will wait before giving up on a 429. */
  maxRetryAfterMs: number;
  /** Minimum delay between two requests (${p.rateLimit.basis}). */
  minIntervalMs: number;
  cacheTtlMs: number;
  userAgent: string;
  /** Your own credential. Read from the environment; never hard-code it. */
  token?: string;
  /** How the credential is sent (as verified during the investigation). */
  authHeader: string;
  authPrefix: string;
  authQuery?: string;
  logger?: (line: string) => void;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const env = process.env;
  return {
    baseUrl: env.${env}_BASE_URL || undefined,
    timeoutMs: num(env.${env}_TIMEOUT_MS, 15000),
    maxRetries: num(env.${env}_MAX_RETRIES, 2),
    maxRetryAfterMs: num(env.${env}_MAX_RETRY_AFTER_MS, 10000),
    minIntervalMs: num(env.${env}_MIN_INTERVAL_MS, ${p.rateLimit.minIntervalMs}),
    cacheTtlMs: num(env.${env}_CACHE_TTL_MS, ${p.cache.defaultTtlMs}),
    userAgent: env.${env}_USER_AGENT || "${p.name}-integration/0.1 (generated by rea-from-api)",
    token: ${p.auth.required ? `env.${p.auth.envVar} || undefined` : "undefined"},
    authHeader: ${JSON.stringify(p.auth.header ?? "Authorization")},
    authPrefix: ${JSON.stringify(p.auth.scheme ?? "Bearer ")},
    authQuery: ${p.auth.query ? JSON.stringify(p.auth.query) : "undefined"},
    ...overrides,
  };
}

function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : d;
}
`;
}

function schemasTs(p: IntegrationPlan): string {
  const parts = [
    `// Types and validators inferred from responses observed on ${new Date().toISOString().slice(0, 10)}.`,
    "// They describe what was seen, not a documented contract. A ValidationError signals format drift.",
    "",
    `import { fail, isObject } from "./errors.ts";`,
    "",
  ];
  for (const s of [...p.sources, ...p.embedded]) {
    parts.push(schemaToTs(s.typeName, s.schema), "", schemaToValidator(s.typeName, s.schema), "");
  }
  parts.push("void fail;", "void isObject;", "");
  return parts.join("\n");
}

function paramsType(s: PlanSource): string {
  const q = s.queryParams.map((x) => `  ${/^[A-Za-z_$][\w$]*$/.test(x.name) ? x.name : JSON.stringify(x.name)}?: string | number;`);
  return q.length ? `{\n${q.join("\n")}\n}` : "Record<string, string | number>";
}

function endpointsTs(p: IntegrationPlan): string {
  const imports = [...p.sources, ...p.embedded].map((s) => `${s.typeName}, validate${s.typeName}`);
  const L: string[] = [
    `import type { HttpClient } from "./http.ts";`,
    `import type { TtlCache } from "./cache.ts";`,
    `import type { Config } from "./config.ts";`,
    `import { IntegrationError } from "./errors.ts";`,
    ...(p.embedded.length ? [`import { extractEmbedded } from "./embedded.ts";`] : []),
    `import { ${imports.map((i) => i.split(", ")[1]).join(", ")} } from "./schemas.ts";`,
    `import type { ${imports.map((i) => i.split(", ")[0]).join(", ")} } from "./schemas.ts";`,
    "",
    "export interface Ctx {",
    "  http: HttpClient;",
    "  cache: TtlCache;",
    "  config: Config;",
    "}",
    "",
    "export interface CallOptions {",
    "  /** Skip the cache for this call. */",
    "  fresh?: boolean;",
    "}",
    "",
    "export interface PageOptions {",
    "  /** Hard upper bound on pages fetched (default 10). Pagination never runs unbounded. */",
    "  maxPages?: number;",
    "}",
    "",
    "type Query = Record<string, string | number | undefined>;",
    "",
    "function buildUrl(ctx: Ctx, template: string, path: Record<string, string | number>, query: Query = {}): string {",
    "  let url = template.replace(/\\{(\\w+)\\}/g, (_m, k: string) => {",
    "    const v = path[k];",
    "    if (v === undefined) throw new IntegrationError(`missing path parameter ${k}`);",
    "    return encodeURIComponent(String(v));",
    "  });",
    "  if (ctx.config.baseUrl) {",
    "    const u = new URL(url);",
    "    url = ctx.config.baseUrl.replace(/\\/$/, '') + u.pathname + u.search;",
    "  }",
    "  const u = new URL(url);",
    "  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') u.searchParams.set(k, String(v));",
    "  return u.toString();",
    "}",
    "",
    "function sameOrigin(a: string, b: string): boolean {",
    "  return new URL(a).origin === new URL(b).origin;",
    "}",
    "",
    "async function cached<T>(ctx: Ctx, key: string, opts: CallOptions | undefined, load: () => Promise<T>): Promise<T> {",
    "  if (!opts?.fresh) {",
    "    const hit = ctx.cache.get<T>(key);",
    "    if (hit !== undefined) return hit;",
    "  }",
    "  const value = await load();",
    "  ctx.cache.set(key, value, ctx.config.cacheTtlMs);",
    "  return value;",
    "}",
    "",
    "function at(value: unknown, path: string): unknown {",
    "  let cur = value;",
    "  for (const k of path.split('.').filter(Boolean)) cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[k] : undefined;",
    "  return cur;",
    "}",
    "void at;",
    "void sameOrigin;",
    "",
  ];
  for (const s of p.sources) L.push(...sourceFns(s));
  for (const e of p.embedded) L.push(...embeddedFn(e));
  return L.join("\n");
}

function sourceFns(s: PlanSource): string[] {
  const t = JSON.stringify(s.urlTemplate);
  const pathArg = s.pathParams.length ? `path: { ${s.pathParams.map((x) => `${x}: string | number`).join("; ")} }, ` : "";
  const pathVal = s.pathParams.length ? "path" : "{}";
  const L = [
    `/** ${s.method} ${s.urlTemplate} — ${s.documented ? "documented" : "undocumented (observed)"}; status at generation: ${s.status}. */`,
    `export async function ${s.fnName}(ctx: Ctx, ${pathArg}query: ${paramsType(s)} = {}, opts?: CallOptions): Promise<${s.typeName}> {`,
    `  const url = buildUrl(ctx, ${t}, ${pathVal}, query as Query);`,
    `  return cached(ctx, url, opts, async () => validate${s.typeName}((await ctx.http.get(url)).data));`,
    "}",
    "",
  ];
  const pg = s.pagination;
  if (!pg) return L;
  const items = pg.itemsField ? `at(page, ${JSON.stringify(pg.itemsField)})` : "page";
  const Name = s.fnName.charAt(0).toUpperCase() + s.fnName.slice(1);
  L.push(
    `/** Iterates pages of ${s.fnName} (${pg.style}: ${pg.basis.replace(/\*\//g, "")}). Bounded by maxPages. */`,
    `export async function* iterate${Name}(ctx: Ctx, ${pathArg}query: ${paramsType(s)} = {}, opts: PageOptions = {}): AsyncGenerator<${s.typeName}> {`,
    "  const maxPages = opts.maxPages ?? 10;",
  );
  switch (pg.style) {
    case "page":
      L.push(
        `  const start = Number((query as Query)[${JSON.stringify(pg.param)}] ?? 1);`,
        "  for (let i = 0; i < maxPages; i++) {",
        `    const page = await ${s.fnName}(ctx, ${s.pathParams.length ? "path, " : ""}{ ...query, ${JSON.stringify(pg.param)}: start + i });`,
        "    yield page;",
        `    const items = ${items};`,
        "    if (Array.isArray(items) && items.length === 0) return;",
        ...(pg.nextField ? [`    if (at(page, ${JSON.stringify(pg.nextField)}) == null) return;`] : []),
        "  }",
      );
      break;
    case "offset":
      L.push(
        `  let offset = Number((query as Query)[${JSON.stringify(pg.param)}] ?? 0);`,
        "  for (let i = 0; i < maxPages; i++) {",
        `    const page = await ${s.fnName}(ctx, ${s.pathParams.length ? "path, " : ""}{ ...query, ${JSON.stringify(pg.param)}: offset });`,
        "    yield page;",
        `    const items = ${items};`,
        "    if (!Array.isArray(items) || items.length === 0) return;",
        "    offset += items.length;",
        "  }",
      );
      break;
    case "cursor":
      L.push(
        "  let q = { ...query } as Query;",
        "  for (let i = 0; i < maxPages; i++) {",
        `    const page = await ${s.fnName}(ctx, ${s.pathParams.length ? "path, " : ""}q);`,
        "    yield page;",
        `    const next = at(page, ${JSON.stringify(pg.nextField ?? "next_cursor")});`,
        "    if (typeof next !== 'string' || !next) return;",
        `    q = { ...q, ${JSON.stringify(pg.param ?? "cursor")}: next };`,
        "  }",
      );
      break;
    case "next-url":
      L.push(
        `  let url: string | undefined = buildUrl(ctx, ${t}, ${pathVal}, query as Query);`,
        "  for (let i = 0; i < maxPages && url; i++) {",
        `    const page: ${s.typeName} = validate${s.typeName}((await ctx.http.get(url)).data);`,
        "    yield page;",
        `    const next = at(page, ${JSON.stringify(pg.nextField ?? "next")});`,
        "    const nextUrl: string | undefined = typeof next === 'string' && next ? new URL(next, url).toString() : undefined;",
        "    url = nextUrl && sameOrigin(nextUrl, url) ? nextUrl : undefined;",
        "  }",
      );
      break;
    case "link-header":
      L.push(
        `  let url: string | undefined = buildUrl(ctx, ${t}, ${pathVal}, query as Query);`,
        "  for (let i = 0; i < maxPages && url; i++) {",
        "    const res = await ctx.http.get(url);",
        `    yield validate${s.typeName}(res.data);`,
        "    const link = res.headers.get('link') ?? '';",
        "    const next = /<([^>]+)>\\s*;\\s*rel=\"?next\"?/.exec(link)?.[1];",
        "    const nextUrl: string | undefined = next ? new URL(next, url).toString() : undefined;",
        "    url = nextUrl && sameOrigin(nextUrl, url) ? nextUrl : undefined;",
        "  }",
      );
      break;
  }
  L.push("}", "");
  return L;
}

function embeddedFn(e: PlanEmbeddedSource): string[] {
  const preferType = e.kind === "json-ld" && e.typeName ? JSON.stringify(e.fnName.replace(/^get/, "").replace(/\d+$/, "")) : "undefined";
  return [
    `/** Extracts ${e.kind} (${e.selector}) from an HTML page. Defaults to the investigated page. */`,
    `export async function ${e.fnName}(ctx: Ctx, pageUrl = ${JSON.stringify(e.pageUrl)}, opts?: CallOptions): Promise<${e.typeName}> {`,
    "  const url = buildUrl(ctx, pageUrl, {});",
    "  return cached(ctx, url, opts, async () => {",
    "    const res = await ctx.http.get<string>(url, 'text/html');",
    `    return validate${e.typeName}(extractEmbedded(String(res.data), ${JSON.stringify(e.kind)}, ${JSON.stringify(e.selector)}, ${preferType}));`,
    "  });",
    "}",
    "",
  ];
}

function allFns(p: IntegrationPlan): string[] {
  const out: string[] = [];
  for (const s of p.sources) {
    out.push(s.fnName);
    if (s.pagination) out.push(`iterate${s.fnName.charAt(0).toUpperCase()}${s.fnName.slice(1)}`);
  }
  for (const e of p.embedded) out.push(e.fnName);
  return out;
}

function indexTs(p: IntegrationPlan): string {
  const fns = allFns(p);
  return `import { HttpClient } from "./http.ts";
import { TtlCache } from "./cache.ts";
import { loadConfig, type Config } from "./config.ts";
import * as ep from "./endpoints.ts";
import type { Ctx } from "./endpoints.ts";

export * from "./errors.ts";
export type * from "./schemas.ts";
export type { Config } from "./config.ts";
export type { CallOptions, PageOptions } from "./endpoints.ts";

type Bound<F> = F extends (ctx: Ctx, ...args: infer A) => infer R ? (...args: A) => R : never;

/** Creates a client for ${p.sourceUrl}. Generated by rea-from-api from verified observations. */
export function createClient(options: Partial<Config> = {}) {
  const config = loadConfig(options);
  const ctx: Ctx = { http: new HttpClient(config), cache: new TtlCache(), config };
  return {
${fns.map((f) => `    ${f}: ((...args: unknown[]) => (ep.${f} as (...a: unknown[]) => unknown)(ctx, ...args)) as Bound<typeof ep.${f}>,`).join("\n")}
    clearCache: () => ctx.cache.clear(),
  };
}

export type Client = ReturnType<typeof createClient>;
`;
}

function sampleCall(s: PlanSource, client = "client"): string {
  const path = s.pathParams.length ? `{ ${s.pathParams.map((x) => `${x}: ${JSON.stringify(examplePathValue(s, x))}`).join(", ")} }, ` : "";
  const q = s.queryParams.filter((x) => x.example !== undefined && x.role !== "pagination");
  const query = q.length ? `{ ${q.map((x) => `${/^[A-Za-z_$][\w$]*$/.test(x.name) ? x.name : JSON.stringify(x.name)}: ${JSON.stringify(x.example)}`).join(", ")} }` : "{}";
  return `${client}.${s.fnName}(${path}${query})`;
}

/** Recovers the example value of a path param from the plan's example (urlTemplate vs fixture path). */
function examplePathValue(s: PlanSource, param: string): string {
  return s.examples[param] ?? "1";
}

function schemaTestTs(p: IntegrationPlan, samples: Map<string, unknown>): string {
  const all = [...p.sources, ...p.embedded];
  const L = [
    `import { test } from "node:test";`,
    `import assert from "node:assert/strict";`,
    `import { readFileSync } from "node:fs";`,
    `import { ValidationError } from "../src/errors.ts";`,
    `import { ${all.map((s) => `validate${s.typeName}`).join(", ")} } from "../src/schemas.ts";`,
    "",
    "const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));",
    "",
  ];
  for (const s of all) {
    if (!samples.has(s.fnName)) {
      L.push(`test.skip(${JSON.stringify(`${s.typeName}: no recorded sample`)}, () => {});`, "");
      continue;
    }
    L.push(
      `test(${JSON.stringify(`${s.typeName} accepts the recorded response`)}, () => {`,
      `  assert.doesNotThrow(() => validate${s.typeName}(fixture(${JSON.stringify(s.fnName)})));`,
      "});",
      "",
    );
    const kind = s.schema?.type ?? "unknown";
    if (kind !== "unknown" && kind !== "null")
      L.push(
        `test(${JSON.stringify(`${s.typeName} rejects a drifted response`)}, () => {`,
        `  assert.throws(() => validate${s.typeName}(${kind === "array" || kind === "object" ? JSON.stringify("not-the-observed-shape") : "{ unexpected: true }"}), ValidationError);`,
        "});",
        "",
      );
  }
  return L.join("\n");
}

function clientTestTs(p: IntegrationPlan, samples: Map<string, unknown>): string {
  const testable = p.sources.filter((s) => samples.has(s.fnName));
  const routes = testable.map((s) => {
    const u = new URL(s.urlTemplate.replace(/\{/g, "%7B").replace(/\}/g, "%7D"));
    const re = decodeURIComponent(u.pathname).replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{\w+\\?\}|\{\w+\}/g, "[^/]+");
    return `  { re: /^${re.replace(/\//g, "\\/")}$/, fixture: ${JSON.stringify(s.fnName)} },`;
  });
  const embeddedRoutes = p.embedded.filter((e) => samples.has(e.fnName));
  const first = testable[0];
  const L = [
    `// Offline tests: a local server replays the recorded (redacted) responses.`,
    `import { test, after } from "node:test";`,
    `import assert from "node:assert/strict";`,
    `import { createServer } from "node:http";`,
    `import { readFileSync } from "node:fs";`,
    `import type { AddressInfo } from "node:net";`,
    `import { createClient, HttpError } from "../src/index.ts";`,
    "",
    "const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');",
    "const routes: { re: RegExp; fixture: string }[] = [",
    ...routes,
    "];",
    "let failNext = 0;",
    "let hits = 0;",
    "const server = createServer((req, res) => {",
    "  hits++;",
    "  if (failNext > 0) {",
    "    failNext--;",
    "    res.writeHead(503).end();",
    "    return;",
    "  }",
    "  const path = new URL(req.url ?? '/', 'http://x').pathname;",
    ...embeddedRoutes.map(
      (e) =>
        `  if (path === ${JSON.stringify(new URL(e.pageUrl).pathname)}) {\n    res.writeHead(200, { 'content-type': 'text/html' }).end(${embeddedHtml(e)});\n    return;\n  }`,
    ),
    "  const r = routes.find((x) => x.re.test(path));",
    "  if (!r) {",
    "    res.writeHead(404).end();",
    "    return;",
    "  }",
    "  res.writeHead(200, { 'content-type': 'application/json' }).end(fixture(r.fixture));",
    "});",
    "await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));",
    "const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;",
    "after(() => server.close());",
    "const client = createClient({ baseUrl, minIntervalMs: 0, maxRetries: 2, timeoutMs: 2000 });",
    "",
  ];
  for (const s of testable) {
    L.push(
      `test(${JSON.stringify(`${s.fnName} returns validated data`)}, async () => {`,
      `  const data = await ${sampleCall(s)};`,
      "  assert.ok(data !== undefined && data !== null);",
      "});",
      "",
    );
    if (s.pagination) {
      const Name = s.fnName.charAt(0).toUpperCase() + s.fnName.slice(1);
      const path = s.pathParams.length ? `{ ${s.pathParams.map((x) => `${x}: ${JSON.stringify(examplePathValue(s, x))}`).join(", ")} }, ` : "";
      L.push(
        `test(${JSON.stringify(`iterate${Name} is bounded by maxPages`)}, async () => {`,
        "  let n = 0;",
        `  for await (const _page of client.iterate${Name}(${path}{}, { maxPages: 2 })) n++;`,
        "  assert.ok(n >= 1 && n <= 2);",
        "});",
        "",
      );
    }
  }
  for (const e of embeddedRoutes) {
    L.push(
      `test(${JSON.stringify(`${e.fnName} extracts embedded ${e.kind}`)}, async () => {`,
      `  const data = await client.${e.fnName}(baseUrl + ${JSON.stringify(new URL(e.pageUrl).pathname)});`,
      "  assert.ok(data !== undefined && data !== null);",
      "});",
      "",
    );
  }
  if (first) {
    L.push(
      "test('retries transient 503 then succeeds', async () => {",
      "  failNext = 1;",
      "  client.clearCache();",
      `  await ${sampleCall(first)};`,
      "  assert.equal(failNext, 0);",
      "});",
      "",
      "test('gives up after maxRetries with HttpError', async () => {",
      "  failNext = 10;",
      "  client.clearCache();",
      `  await assert.rejects(${sampleCall(first)}, HttpError);`,
      "  failNext = 0;",
      "});",
      "",
      "test('serves repeated calls from cache', async () => {",
      "  client.clearCache();",
      `  await ${sampleCall(first)};`,
      "  const before = hits;",
      `  await ${sampleCall(first)};`,
      "  assert.equal(hits, before);",
      "});",
      "",
    );
  }
  if (!testable.length && !embeddedRoutes.length) L.push("test.skip('no recorded samples to replay', () => {});", "");
  return L.join("\n");
}

function embeddedHtml(e: PlanEmbeddedSource): string {
  const data = `\${fixture(${JSON.stringify(e.fnName)})}`;
  const tag =
    e.kind === "json-ld" ? `<script type="application/ld+json">${data}</script>`
    : e.selector.startsWith("script#") ? `<script id="${e.selector.slice(7)}" type="application/json">${data}</script>`
    : e.selector.startsWith("window.") ? `<script>${e.selector} = ${data};</script>`
    : `<script type="${/"([^"]+)"/.exec(e.selector)?.[1] ?? "application/json"}">${data}</script>`;
  return `\`<html><body>${tag}</body></html>\``;
}

function liveTestTs(p: IntegrationPlan): string {
  const L = [
    "// Live smoke tests against the real source. Opt-in: LIVE=1 node --test tests/live.test.ts",
    "// They issue a handful of read-only GET requests; keep them out of tight CI loops.",
    `import { test } from "node:test";`,
    `import assert from "node:assert/strict";`,
    `import { createClient } from "../src/index.ts";`,
    "",
    "const live = process.env.LIVE === '1';",
    "const client = createClient({ cacheTtlMs: 0 });",
    "",
  ];
  for (const s of p.sources)
    L.push(`test(${JSON.stringify(`live: ${s.fnName}`)}, { skip: !live && 'set LIVE=1' }, async () => {`, `  const data = await ${sampleCall(s)};`, "  assert.ok(data !== undefined && data !== null);", "});", "");
  for (const e of p.embedded)
    L.push(`test(${JSON.stringify(`live: ${e.fnName}`)}, { skip: !live && 'set LIVE=1' }, async () => {`, `  const data = await client.${e.fnName}();`, "  assert.ok(data !== undefined && data !== null);", "});", "");
  return L.join("\n");
}

function exampleTs(p: IntegrationPlan): string {
  const L = [
    `// Usage example. Run: node examples/basic.ts`,
    `import { createClient } from "../src/index.ts";`,
    "",
    "const client = createClient({ logger: (line) => console.error(line) });",
    "",
  ];
  const first = p.sources[0];
  if (first) {
    L.push(`const data = await ${sampleCall(first)};`, "console.log(JSON.stringify(data, null, 2).slice(0, 2000));");
    if (first.pagination) {
      const Name = first.fnName.charAt(0).toUpperCase() + first.fnName.slice(1);
      const path = first.pathParams.length ? `{ ${first.pathParams.map((x) => `${x}: ${JSON.stringify(examplePathValue(first, x))}`).join(", ")} }, ` : "";
      L.push("", "let pages = 0;", `for await (const _page of client.iterate${Name}(${path}{}, { maxPages: 2 })) pages++;`, "console.log(`fetched ${pages} page(s)`);");
    }
  } else if (p.embedded[0]) {
    L.push(`const data = await client.${p.embedded[0].fnName}();`, "console.log(JSON.stringify(data, null, 2).slice(0, 2000));");
  }
  return `${L.join("\n")}\n`;
}

function envExample(p: IntegrationPlan): string {
  const e = constName(p.name);
  return [
    `# ${p.name} integration settings (all optional)`,
    `${e}_BASE_URL=`,
    `${e}_TIMEOUT_MS=15000`,
    `${e}_MAX_RETRIES=2`,
    `${e}_MIN_INTERVAL_MS=${p.rateLimit.minIntervalMs}`,
    `${e}_CACHE_TTL_MS=${p.cache.defaultTtlMs}`,
    ...(p.auth.required
      ? ["", `# Your own authorized token/key, from the provider's official developer portal.`, `# Sent as ${p.auth.query ? `query parameter "${p.auth.query}"` : `header ${p.auth.header ?? "Authorization"}`}.`, `${p.auth.envVar}=`]
      : []),
    "",
  ].join("\n");
}

function readme(p: IntegrationPlan, standalone: boolean): string {
  const fns = allFns(p);
  return `# ${p.name}

Generated by [rea-from-api](https://github.com/vitorcgo/rea-from-api) for: _${p.goal}_

Source: ${p.sourceUrl} · strategy: **${p.strategy}**

## Functions

${p.sources.map((s) => `- \`${s.fnName}(${s.pathParams.length ? "path, " : ""}query?, opts?)\` → \`${s.typeName}\` — \`GET ${s.urlTemplate}\` (${s.documented ? "documented" : "undocumented"}, ${s.status})`).join("\n")}
${p.sources.filter((s) => s.pagination).map((s) => `- \`iterate${s.fnName.charAt(0).toUpperCase()}${s.fnName.slice(1)}(…, { maxPages })\` — ${s.pagination!.style} pagination, bounded`).join("\n")}
${p.embedded.map((e) => `- \`${e.fnName}(pageUrl?)\` → \`${e.typeName}\` — ${e.kind} \`${e.selector}\``).join("\n")}

## Install & run

${standalone ? "```bash\nnpm install   # dev dependencies only (typescript, @types/node)\nnpm test      # offline tests against recorded fixtures\nLIVE=1 npm run test:live   # opt-in live smoke tests\nnode examples/basic.ts\n```" : "Copy/keep this folder in your project. Requires Node >= 22.18 (runs .ts directly) or your TS toolchain.\n\n```bash\nnode --test " + "tests/*.test.ts\n```"}

Configuration: see \`.env.example\`. ${p.auth.required ? `Set \`${p.auth.envVar}\` to **your own** authorized token.` : "No credentials needed for the selected endpoints at generation time."}

## Behaviour

- Timeouts per request, bounded retries (network errors, 429 with Retry-After cap, 502/503/504).
- ${p.rateLimit.minIntervalMs} ms minimum interval between requests (${p.rateLimit.basis}).
- In-memory TTL cache (${p.cache.defaultTtlMs} ms default); \`opts.fresh\` bypasses it.
- Responses are validated against the shape observed during investigation; \`ValidationError\` means the source changed.
- Logs (opt-in \`logger\`) redact sensitive query values and never include headers.

## Architecture

\`\`\`mermaid
${renderMermaid(p).trimEnd()}
\`\`\`

## Limitations & risks

${p.risks.map((r) => `- ${r}`).join("\n")}
- Types/validators describe observed responses, not a documented contract.
`;
}

function standalonePackage(p: IntegrationPlan) {
  return {
    name: p.name,
    version: "0.1.0",
    private: true,
    type: "module",
    engines: { node: ">=22.18.0" },
    exports: { ".": "./src/index.ts" },
    scripts: {
      typecheck: "tsc -p tsconfig.json",
      test: "node --test tests/schemas.test.ts tests/client.test.ts",
      "test:live": "LIVE=1 node --test tests/live.test.ts",
      example: "node examples/basic.ts",
    },
    devDependencies: { typescript: "5.9.3", "@types/node": "22.20.5" },
  };
}

const TSCONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      target: "ES2023",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      allowImportingTsExtensions: true,
      verbatimModuleSyntax: true,
      erasableSyntaxOnly: true,
      skipLibCheck: true,
      types: ["node"],
    },
    include: ["src", "tests", "examples"],
  },
  null,
  2,
)}\n`;
