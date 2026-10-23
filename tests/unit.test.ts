import { test } from "node:test";
import assert from "node:assert/strict";
import { inferSchema, mergeSchemas, findItemsPath, fieldNames, looksLikeMap } from "../src/analysis/schema.ts";
import { detectPagination } from "../src/analysis/pagination.ts";
import { analyzeHtml, classifyAppType } from "../src/analysis/html.ts";
import { scanJsForUrls } from "../src/analysis/jsScan.ts";
import { goalTokens, scoreEndpoint } from "../src/analysis/goal.ts";
import { redactUrl, redactJson, redactText, isSensitiveName } from "../src/core/redact.ts";
import { parseRobots } from "../src/core/robots.ts";
import { EndpointInventory, templatePath, expandSeed, classifyParam } from "../src/core/inventory.ts";
import { detectChallenge } from "../src/core/http.ts";
import { resolveLimits } from "../src/core/limits.ts";
import { schemaToTs, schemaToValidator, tsType } from "../src/generate/tsTypes.ts";
import { trimSample } from "../src/generate/typescript.ts";
import { parseLinkHeader } from "../src/strategies/wellKnown.ts";
import { parseStructured, siteOf, sameSite, isOpenApi } from "../src/strategies/specIngest.ts";
import { typeRefToString } from "../src/strategies/graphql.ts";
import { toJsonSchema } from "../src/openapi/build.ts";

test("inferSchema describes observed shape, formats and required keys", () => {
  const s = inferSchema({ id: 1, name: "a", at: "2026-01-01T00:00:00Z", url: "https://x.y/z", tags: ["t"], meta: null });
  assert.equal(s.type, "object");
  assert.equal(s.properties?.id?.type, "integer");
  assert.equal(s.properties?.at?.format, "date-time");
  assert.equal(s.properties?.url?.format, "uri");
  assert.equal(s.properties?.tags?.items?.type, "string");
  assert.equal(s.properties?.meta?.type, "null");
  assert.deepEqual(s.required?.sort(), ["at", "id", "meta", "name", "tags", "url"]);
});

test("mergeSchemas: optional keys, nullability, integer+number, anyOf", () => {
  const m = mergeSchemas(inferSchema({ a: 1, b: "x", c: null }), inferSchema({ a: 1.5, c: "y", d: true }));
  assert.equal(m.properties?.a?.type, "number");
  assert.deepEqual(m.required, ["a", "c"]);
  assert.equal(m.properties?.c?.type, "string");
  assert.equal(m.properties?.c?.nullable, true);
  const mixed = mergeSchemas(inferSchema("x"), inferSchema(3));
  assert.equal(mixed.type, "unknown");
  assert.deepEqual(mixed.anyOf?.map((x) => x.type).sort(), ["integer", "string"]);
});

test("map-like objects (keyed by version/id) become additionalProperties", () => {
  assert.ok(looksLikeMap(["0.1.0", "0.2.0", "1.0.0", "2.31.0"]));
  assert.ok(!looksLikeMap(["name", "version", "summary", "author"]));
  const s = inferSchema({ releases: { "1.0.0": [{ size: 1 }], "1.1.0": [{ size: 2 }], "2.0.0": [], "2.1.0": [{ size: 3 }] } });
  assert.equal(s.properties?.releases?.additionalProperties?.type, "array");
  assert.equal(tsType(s.properties?.releases), "Record<string, {\n  size: number;\n}[]>");
  assert.deepEqual(fieldNames(s).slice(0, 2), ["releases", "releases.*.size"]);
});

test("findItemsPath finds the main record array", () => {
  assert.equal(findItemsPath({ data: { results: [{ a: 1 }, { a: 2 }] }, total: 2 })?.path, "data.results");
  assert.equal(findItemsPath([{ a: 1 }])?.path, "");
});

test("detectPagination: page, cursor, next-url, link header", () => {
  const qp = (...names: string[]) => ({ queryParams: names.map((name) => ({ name })) });
  assert.equal(detectPagination(qp("page", "limit"), { items: [{}], next: "/x?page=2" })?.style, "page");
  assert.equal(detectPagination(qp(), { data: [{}], next_cursor: "abc" })?.style, "cursor");
  assert.equal(detectPagination(qp(), { results: [{}], next: "https://x/api?p=2" })?.style, "next-url");
  assert.equal(detectPagination(qp(), [{}], '<https://x/a?page=2>; rel="next"')?.style, "link-header");
  assert.equal(detectPagination(qp("q"), { a: 1 }), undefined);
});

test("analyzeHtml extracts embedded JSON, scripts, forms, doc links, tech", () => {
  const html = `<html><head><title>T</title><meta name="generator" content="WordPress 6.5">
  <script type="application/ld+json">{"@type":"Product","name":"X"}</script>
  <script id="__NEXT_DATA__" type="application/json">{"props":{"a":1}}</script>
  <script src="/_next/static/app.js"></script></head>
  <body><a href="/developers">Developer API</a><form action="/s" method="get"><input name="q"></form></body></html>`;
  const a = analyzeHtml(html, "https://ex.com/p");
  assert.equal(a.title, "T");
  assert.deepEqual(a.scripts, ["https://ex.com/_next/static/app.js"]);
  assert.deepEqual(a.embedded.map((e) => e.kind), ["json-ld", "next-data"]);
  assert.deepEqual(a.docLinks, ["https://ex.com/developers"]);
  assert.deepEqual(a.forms[0], { action: "https://ex.com/s", method: "GET", inputs: ["q"] });
  assert.ok(a.tech.some((t) => t.name === "Next.js"));
  assert.ok(a.tech.some((t) => t.name === "WordPress"));
  assert.match(classifyAppType(a, html), /SPA shell/);
});

test("scanJsForUrls finds literal and concatenated API URLs, ignores assets", () => {
  const js = `fetch("/api/v2/products?page="+p);axios.get('/api/v2/categories');fetch(\`/api/v2/products/\${id}\`);
  const img="/static/logo.png";fetch("/api/v2/orders",{method:"POST",body:x});fetch("/api/v2/list",{headers:{a:1}});`;
  const found = scanJsForUrls(js, "https://ex.com/static/app.js");
  const byValue = Object.fromEntries(found.map((f) => [f.value, f]));
  assert.ok(byValue["/api/v2/products?page="]);
  assert.equal(byValue["/api/v2/categories"]?.method, "GET");
  assert.ok(byValue["/api/v2/products/{param}"]);
  assert.equal(byValue["/api/v2/orders"]?.method, "POST");
  assert.equal(byValue["/api/v2/list"]?.method, undefined, "method from a later call must not leak");
  assert.ok(!found.some((f) => f.value.endsWith(".png")));
  const short = scanJsForUrls(`fetch("/graphql", { method: "POST", body: b }); fetch("/search?q=" + q);`, "https://ex.com/app.js");
  assert.equal(short.find((f) => f.value === "/graphql")?.method, "POST", "short API paths are found without jsluice");
  assert.ok(short.some((f) => f.value.startsWith("/search")));
});

test("redaction: URLs, JSON keys (type-preserving), free text", () => {
  assert.equal(redactUrl("https://u:p@x.com/a?api_key=SECRET&page=2"), "https://x.com/a?api_key=%5BREDACTED%5D&page=2");
  assert.deepEqual(redactJson({ token: "abc", has_sig: true, nested: { password: "x", n: 1 } }), {
    token: "[REDACTED]",
    has_sig: true,
    nested: { password: "[REDACTED]", n: 1 },
  });
  assert.doesNotMatch(redactText("Authorization: Bearer abc.def.ghi"), /abc\.def/);
  assert.doesNotMatch(redactText('{"access_token":"zzz"}'), /zzz/);
  assert.ok(isSensitiveName("X-Api-Key"));
  assert.ok(!isSensitiveName("monkey"));
});

test("robots.txt: longest match, allow override, wildcards", () => {
  const r = parseRobots("User-agent: *\nDisallow: /pypi/*/json\nDisallow: /private\nAllow: /private/public\nDisallow: /*.pdf$\n");
  assert.equal(r.isAllowed("/pypi/requests/json"), false);
  assert.equal(r.isAllowed("/pypi/requests/"), true);
  assert.equal(r.isAllowed("/private/x"), false);
  assert.equal(r.isAllowed("/private/public/x"), true);
  assert.equal(r.isAllowed("/a.pdf"), false);
  assert.equal(r.isAllowed("/a.pdf?x"), true);
});

test("inventory templates ids, merges sources and promotes status", () => {
  assert.deepEqual(templatePath("/api/products/123/reviews/9f3c1a2b-1111-2222-3333-444455556666"), {
    path: "/api/products/{productId}/reviews/{reviewId}",
    params: ["productId", "reviewId"],
  });
  assert.deepEqual(expandSeed("https://x/pypi/{project:requests}/json"), { url: "https://x/pypi/requests/json", template: "https://x/pypi/{project}/json" });
  const inv = new EndpointInventory();
  inv.add({ method: "GET", url: "https://x/api/p/{param}", template: "https://x/api/p/{param}", strategy: "js", evidenceId: "e1", status: "inferred" });
  const rec = inv.add({ method: "GET", url: "https://x/api/p/{id}", template: "https://x/api/p/{id}", strategy: "spec", evidenceId: "e2", status: "observed", documented: true, purpose: "Get p" });
  assert.equal(inv.all.length, 1, "differently named placeholders are the same endpoint");
  assert.equal(rec.status, "observed");
  assert.deepEqual(rec.pathParams, ["id"], "documented names win");
  assert.deepEqual(rec.discoveredBy, ["js", "spec"]);
  inv.add({ method: "GET", url: "https://x/api/p?token=abc", strategy: "b", evidenceId: "e3", status: "observed", httpStatus: 401 });
  const p = inv.all.find((e) => e.urlTemplate === "https://x/api/p")!;
  assert.equal(p.auth, "required");
  assert.equal(p.queryParams[0]?.sensitive, true);
  assert.equal(p.queryParams[0]?.example, undefined, "sensitive values are never stored");
  assert.equal(classifyParam("per_page"), "pagination");
  assert.equal(classifyParam("category"), "filter");
});

test("goal scoring prefers matching resources (PT→EN)", () => {
  const t = goalTokens("dados públicos de produtos e preços");
  assert.ok(t.includes("products") && t.includes("price"));
  const mk = (urlTemplate: string) =>
    ({ urlTemplate, queryParams: [], responseFormat: "json", status: "confirmed" }) as unknown as Parameters<typeof scoreEndpoint>[0];
  assert.ok(scoreEndpoint(mk("https://x/api/products"), t) > scoreEndpoint(mk("https://x/api/banners"), t));
});

test("challenge detection stops instead of bypassing", () => {
  assert.equal(detectChallenge(403, new Headers({ "cf-mitigated": "challenge" }), ""), "Cloudflare challenge");
  assert.equal(detectChallenge(200, new Headers(), "<html>ok</html>"), undefined);
});

test("limits are clamped to hard ceilings", () => {
  const l = resolveLimits({ maxRequests: 10_000, maxRetries: 99, maxScripts: 3 });
  assert.equal(l.maxRequests, 500);
  assert.equal(l.maxRetries, 4);
  assert.equal(l.maxScripts, 3);
});

test("generated validator accepts the sample and rejects drift", async () => {
  const sample = { items: [{ id: 1, name: "a", price: null }], next: null, meta: { "1.0": { n: 1 }, "1.1": { n: 2 }, "2.0": { n: 3 }, "2.1": { n: 4 } } };
  const schema = mergeSchemas(inferSchema(sample), inferSchema({ items: [{ id: 2, name: "b", price: 3.5 }], next: "/p2", meta: {} }));
  const code = [
    "class ValidationError extends Error {}",
    "function fail(p, e, g) { throw new ValidationError(p + ':' + e); }",
    "function isObject(v) { return typeof v === 'object' && v !== null && !Array.isArray(v); }",
    schemaToValidator("T", schema).replace(/^export /, "").replace(/: unknown\)/, ")").replace(/\): T \{/, ") {").replace(/ as T;/, ";").replace(/ as (unknown\[\]|Record<string, unknown>|object)/g, ""),
    "return { validateT, ValidationError };",
  ].join("\n");
  const { validateT, ValidationError } = new Function(code)() as { validateT: (v: unknown) => unknown; ValidationError: new () => Error };
  assert.doesNotThrow(() => validateT(sample));
  assert.throws(() => validateT({ items: [{ id: "x", name: "a" }], next: null, meta: {} }), ValidationError);
  assert.throws(() => validateT({ items: [], next: null, meta: { "1.0": { n: "x" } } }), ValidationError);
  assert.match(schemaToTs("T", schema), /price: number \| null;/);
  assert.match(schemaToTs("T", schema), /meta: Record<string, \{/);
});

test("trimSample bounds arrays and map-like objects", () => {
  const big = { list: Array.from({ length: 50 }, (_, i) => i), map: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`1.${i}.0`, i])) };
  const t = trimSample(big) as { list: number[]; map: Record<string, number> };
  assert.equal(t.list.length, 20);
  assert.equal(Object.keys(t.map).length, 20);
});

test("Link header parsing (RFC 8288) for service-desc / api-catalog", () => {
  const l = parseLinkHeader('</openapi.json>; rel="service-desc"; type="application/json", <https://x.com/.well-known/api-catalog>; rel=api-catalog', "https://x.com/p");
  assert.deepEqual(l, [
    { href: "https://x.com/openapi.json", rel: "service-desc" },
    { href: "https://x.com/.well-known/api-catalog", rel: "api-catalog" },
  ]);
});

test("specs parse from JSON and YAML; site grouping", () => {
  const y = parseStructured({ text: "openapi: 3.1.0\ninfo: {title: t, version: '1'}\npaths:\n  /a:\n    get: {}\n", contentType: "application/yaml" });
  assert.ok(isOpenApi(y));
  assert.equal(siteOf("api.shop.example.com.br"), "example.com.br");
  assert.equal(siteOf("developer.example.co.uk"), "example.co.uk");
  assert.ok(sameSite("https://api.example.com/x", "https://www.example.com"));
  assert.ok(!sameSite("https://api.other.com", "https://www.example.com"));
});

test("GraphQL type refs render as SDL", () => {
  assert.equal(typeRefToString({ kind: "NON_NULL", name: null, ofType: { kind: "LIST", name: null, ofType: { kind: "OBJECT", name: "Product" } } }), "[Product]!");
});

test("JsonSchema → OpenAPI 3.1 JSON Schema (nullable as type arrays, maps)", () => {
  assert.deepEqual(toJsonSchema({ type: "string", nullable: true, format: "uri" }), { type: ["string", "null"], format: "uri" });
  assert.deepEqual(toJsonSchema({ type: "object", additionalProperties: { type: "integer" } }), { type: "object", additionalProperties: { type: "integer" } });
});

test("drift: removed operation/field and type change are breaking; new field is info", async () => {
  const { diffOpenApi, driftReport } = await import("../src/drift.ts");
  const op = (props: Record<string, unknown>, required: string[]) => ({
    get: { responses: { "200": { description: "ok", content: { "application/json": { schema: { type: "object", properties: props, required } } } } }, parameters: [] },
  });
  const a = { openapi: "3.1.0", info: { title: "a", version: "1" }, paths: { "/p": op({ id: { type: "integer" }, name: { type: "string" } }, ["id", "name"]), "/gone": op({}, []) } };
  const b = { openapi: "3.1.0", info: { title: "b", version: "2" }, paths: { "/p": op({ id: { type: "string" }, extra: { type: "boolean" } }, ["id"]) } };
  const changes = diffOpenApi(a, b);
  const has = (level: string, re: RegExp) => changes.some((c) => c.level === level && re.test(`${c.path} ${c.message}`));
  assert.ok(has("breaking", /GET \/gone operation no longer present/));
  assert.ok(has("breaking", /\.id type changed integer → string/));
  assert.ok(has("breaking", /\.name field removed/));
  assert.ok(has("info", /\.extra new field/));
  const report = await driftReport(a, b);
  assert.equal(report.breaking, 3);
  if (report.oasdiff?.available) assert.match(report.oasdiff.output, /error|breaking|removed/i, "oasdiff agrees when installed");
});

test("package.json, server.json and VERSION agree", async () => {
  const { readFileSync } = await import("node:fs");
  const { VERSION } = await import("../src/version.ts");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const server = JSON.parse(readFileSync(new URL("../server.json", import.meta.url), "utf8"));
  assert.equal(pkg.version, VERSION);
  assert.equal(server.version, VERSION);
  assert.equal(server.packages[0].version, VERSION);
  assert.equal(server.name, pkg.mcpName);
  assert.ok(server.description.length <= 100, "MCP registry descriptions are limited to 100 characters");
});
