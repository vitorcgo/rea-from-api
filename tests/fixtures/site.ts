// Deterministic fixture "shop" covering the cases rea-from-api must handle:
// - SPA shell that loads products via fetch (only visible in browser traffic)
// - JS bundle with concatenated URLs (static scan) and an admin route (401)
// - an OpenAPI document (official/documented source)
// - page-based pagination with `next`, a detail endpoint, rate-limit headers
// - robots.txt disallowing /private
// - an HTML-only page with JSON-LD and __NEXT_DATA__ (no API)
// - a page answering with a bot challenge (must stop, never bypass)

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";

const PRODUCTS = Array.from({ length: 7 }, (_, i) => ({
  id: i + 1,
  name: `Product ${i + 1}`,
  price: 10 + i * 2.5,
  category: i % 2 ? "tools" : "books",
  updated_at: `2026-01-0${(i % 9) + 1}T10:00:00Z`,
  tags: i % 3 ? ["sale"] : [],
}));

const PAGE_SIZE = 3;

/** API key the fixture accepts on /api/v1/partner/prices (stands in for the user's own key). */
export const FIXTURE_API_KEY = "fixture-key-7f3a9c";

export interface FixtureSite {
  url: string;
  server: Server;
  hits: Map<string, number>;
  close(): Promise<void>;
}

export async function startFixtureSite(): Promise<FixtureSite> {
  const hits = new Map<string, number>();
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    hits.set(u.pathname, (hits.get(u.pathname) ?? 0) + 1);
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
      res.end(JSON.stringify(body));
    };
    const html = (body: string, status = 200) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8", "x-powered-by": "fixture" });
      res.end(body);
    };
    if (u.pathname === "/graphql" && req.method === "POST") return graphqlIntrospection(req, json);
    if (req.method !== "GET" && req.method !== "HEAD") return json(405, { error: "read-only fixture" });

    switch (u.pathname) {
      case "/robots.txt":
        res.writeHead(200, { "content-type": "text/plain" });
        return res.end("User-agent: *\nDisallow: /private\n");
      case "/":
        return html(`<!doctype html><html><head><title>Fixture Shop</title>
<meta name="generator" content="FixtureGen 1.0">
<link rel="alternate" type="application/json" href="/openapi.json">
</head><body><div id="app"></div>
<a href="/docs/api">API documentation</a>
<form action="/search" method="get"><input name="q"><select name="category"></select></form>
<script src="/static/app.js"></script></body></html>`);
      case "/static/app.js":
        res.writeHead(200, { "content-type": "application/javascript" });
        return res.end(`const API = "/api/v1";
function listProducts(page){ return fetch("/api/v1/products?page=" + page + "&limit=3").then(r => r.json()); }
function product(id){ return fetch(\`/api/v1/products/\${id}\`).then(r => r.json()); }
function admin(){ return fetch("/api/v1/admin/users", { headers: { "x-api-key": KEY } }); }
function save(p){ return fetch("/api/v1/products", { method: "POST", body: JSON.stringify(p) }); }
listProducts(1).then(d => { document.getElementById("app").textContent = d.items.map(p => p.name).join(", "); document.body.dataset.ready = "1"; });
fetch("/api/v1/categories");
function gql(q){ return fetch("/graphql", { method: "POST", body: JSON.stringify({ query: q }) }); }
//# sourceMappingURL=app.js.map`);
      case "/static/app.js.map":
        return json(200, {
          version: 3,
          sources: ["webpack:///src/api/reviews.ts", "webpack:///node_modules/lib/index.js"],
          sourcesContent: [
            "export async function reviewsFor(productId: number) {\n  return (await fetch(`/api/v1/reviews?product=${productId}`)).json();\n}\n",
            "fetch('/should/not/be/used');",
          ],
          mappings: "",
        });
      case "/api/v1/reviews":
        return json(200, { reviews: [{ id: 1, product: Number(u.searchParams.get("product") ?? 1), stars: 5, text: "Great" }] });
      case "/.well-known/api-catalog":
        res.writeHead(200, { "content-type": 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"' });
        return res.end(
          JSON.stringify({
            linkset: [
              {
                anchor: "/.well-known/api-catalog",
                "service-desc": [{ href: "/specs/stores.yaml", type: "application/yaml" }],
                "service-doc": [{ href: "/docs/api", type: "text/html" }],
              },
            ],
          }),
        );
      case "/specs/stores.yaml":
        res.writeHead(200, { "content-type": "application/yaml" });
        return res.end("openapi: 3.1.0\ninfo:\n  title: Stores\n  version: '1'\nservers:\n  - url: /api/v1\npaths:\n  /stores:\n    get:\n      summary: List physical stores\n      parameters:\n        - name: city\n          in: query\n");
      case "/api/v1/stores":
        return json(200, [{ id: "sp-1", city: "São Paulo", open: true }, { id: "rj-1", city: "Rio de Janeiro", open: false }]);
      case "/llms.txt":
        res.writeHead(200, { "content-type": "text/plain" });
        return res.end("# Fixture Shop\n\n- [API reference](/docs/api): public REST API\n- [About](/about)\n");
      case "/_next/data/abc/catalog.json":
        return json(200, { pageProps: { products: [{ sku: "L-1", stock: 3 }, { sku: "D-2", stock: 0 }] }, __N_SSP: true });
      case "/mock/apisguru/v2/127.0.0.1.json":
        return json(200, { apis: { "fixture:shop": { preferred: "1", versions: { "1": { swaggerUrl: `http://${req.headers.host}/openapi.json`, info: { title: "Fixture Shop" } } } } } });
      case "/mock/wayback/cdx/search/cdx":
        return json(200, [
          ["original", "mimetype", "statuscode", "timestamp"],
          [`http://${req.headers.host}/api/v1/legacy-feed.json`, "application/json", "200", "20190101000000"],
          [`http://${req.headers.host}/api/v1/categories`, "application/json", "200", "20240101000000"],
          [`http://${req.headers.host}/about`, "text/html", "200", "20240101000000"],
        ]);
      case "/openapi.json":
        return json(200, {
          openapi: "3.0.3",
          info: { title: "Fixture Shop", version: "1" },
          servers: [{ url: "/api/v1" }],
          paths: {
            "/products": { get: { summary: "List products", parameters: [{ name: "page", in: "query" }, { name: "limit", in: "query" }, { name: "category", in: "query" }] } },
            "/products/{id}": { get: { summary: "Get one product", parameters: [{ name: "id", in: "path", required: true }] } },
            "/categories": { get: { summary: "List categories" } },
            "/partner/prices": { get: { summary: "Partner price list (API key)", security: [{ apiKey: [] }] } },
            "/orders": { post: { summary: "Create order", security: [{ bearer: [] }] } },
          },
        });
      case "/docs/api":
        return html("<html><body><h1>API</h1><p>Our public REST API endpoint list.</p></body></html>");
      case "/api/v1/products": {
        const page = Math.max(1, Number(u.searchParams.get("page") ?? "1"));
        const limit = Math.min(10, Number(u.searchParams.get("limit") ?? PAGE_SIZE));
        const cat = u.searchParams.get("category");
        const all = cat ? PRODUCTS.filter((p) => p.category === cat) : PRODUCTS;
        const items = all.slice((page - 1) * limit, page * limit);
        const pages = Math.ceil(all.length / limit);
        return json(
          200,
          { items, page, total_pages: pages, total: all.length, next: page < pages ? `/api/v1/products?page=${page + 1}&limit=${limit}` : null },
          { "x-ratelimit-limit": "60", "x-ratelimit-remaining": "59" },
        );
      }
      case "/api/v1/partner/prices":
        if (req.headers["x-api-key"] !== FIXTURE_API_KEY) return json(401, { error: "missing or invalid X-Api-Key" });
        return json(200, { prices: PRODUCTS.map((p) => ({ id: p.id, price: p.price, currency: "BRL" })) });
      case "/api/v1/categories":
        return json(200, [{ id: "books", label: "Books" }, { id: "tools", label: "Tools" }]);
      case "/api/v1/admin/users":
        return json(401, { error: "unauthorized" });
      case "/search":
        return html(`<html><body>results for ${escape(u.searchParams.get("q") ?? "")}</body></html>`);
      case "/private/data":
        return json(200, { secret: "should never be fetched" });
      case "/catalog":
        return html(`<!doctype html><html><head><title>Catalog</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","itemListElement":[{"@type":"Product","name":"Lamp","sku":"L-1","offers":{"@type":"Offer","price":"19.90","priceCurrency":"BRL"}},{"@type":"Product","name":"Desk","sku":"D-2","offers":{"@type":"Offer","price":"499.00","priceCurrency":"BRL"}}]}</script>
<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"products":[{"sku":"L-1","stock":3},{"sku":"D-2","stock":0}]}},"page":"/catalog","buildId":"abc"}</script>
<script src="/_next/static/chunks/main.js"></script>
</head><body><h1>Catalog</h1><ul><li>Lamp</li><li>Desk</li></ul>${"<p>filler text to look server-rendered.</p>".repeat(10)}</body></html>`);
      case "/_next/static/chunks/main.js":
        res.writeHead(200, { "content-type": "application/javascript" });
        return res.end("console.log('hydrate');");
      case "/protected":
        res.writeHead(403, { "content-type": "text/html", "cf-mitigated": "challenge" });
        return res.end("<html><title>Just a moment...</title><body>challenge-platform</body></html>");
    }
    const m = /^\/api\/v1\/products\/(\d+)$/.exec(u.pathname);
    if (m) {
      const p = PRODUCTS.find((x) => x.id === Number(m[1]));
      return p ? json(200, p) : json(404, { error: "not found" });
    }
    json(404, { error: "not found" });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, server, hits, close: () => new Promise((r) => server.close(() => r())) };
}

function graphqlIntrospection(req: import("node:http").IncomingMessage, json: (status: number, body: unknown) => void): void {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    let q = "";
    try {
      q = (JSON.parse(body) as { query?: string }).query ?? "";
    } catch {
      return json(400, { errors: [{ message: "bad json" }] });
    }
    if (!q.includes("__schema")) return json(400, { errors: [{ message: "only introspection in fixture" }] });
    const t = (name: string) => ({ kind: "SCALAR", name, ofType: null });
    json(200, {
      data: {
        __schema: {
          queryType: { name: "Query" },
          mutationType: { name: "Mutation" },
          subscriptionType: null,
          types: [
            { kind: "OBJECT", name: "Query", fields: [
              { name: "product", description: null, args: [{ name: "id", type: { kind: "NON_NULL", name: null, ofType: t("ID") } }], type: { kind: "OBJECT", name: "Product", ofType: null } },
              { name: "products", description: null, args: [], type: { kind: "LIST", name: null, ofType: { kind: "OBJECT", name: "Product", ofType: null } } },
            ] },
            { kind: "OBJECT", name: "Mutation", fields: [{ name: "deleteProduct", description: null, args: [], type: t("Boolean") }] },
            { kind: "OBJECT", name: "Product", fields: [{ name: "id", description: null, args: [], type: t("ID") }] },
          ],
        },
      },
    });
  });
}

function escape(s: string): string {
  return s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Allow `node tests/fixtures/site.ts` for manual exploration.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = await startFixtureSite();
  process.stdout.write(`fixture site on ${s.url}\n`);
}
