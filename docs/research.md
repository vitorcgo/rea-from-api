# Research: what makes an API reverse-engineering tool genuinely useful

Goal: make rea-from-api for **APIs** what REA is for binaries (one CLI + MCP server
that an agent drives, with evidence for every claim) and connect it to the
ecosystem instead of re-inventing (or stopping at) a headless browser.

## 1. What REA does well (and we copy)

| REA trait | rea-from-api equivalent |
|---|---|
| One MCP server + one CLI with identical contracts | `rea-from-api mcp` (stdio) exposes the same operations as the CLI |
| `setup` registers the server with agents and installs the skill | `rea-from-api setup` |
| Evidence objects with ids, limitations, provenance | `evidence.json`, REA evidence ids linked |
| "Caller-supplied engines" (Ghidra, Hopper…) detected, never auto-installed | optional providers: jsluice, schemathesis, oasdiff, spectral, quicktype |
| Capability table in the README ("What you can analyze") | "What you can discover" table |

## 2. The central artifact must be OpenAPI, not a private format

Every serious tool in this space converges on OpenAPI as the interchange format:
traffic → spec converters ([har-to-openapi](https://npmjs.com/package/har-to-openapi),
[mitmproxy2swagger](https://docsearch.algolia.com/mcp/docs/repo/alufers/mitmproxy2swagger),
[mitm2openapi](https://docs.rs/crate/mitm2openapi/latest),
[traffic2openapi](https://pkg.go.dev/github.com/grokify/traffic2openapi) which also infers
auth, pagination and rate-limit headers). Once the observed API is an OpenAPI 3.1
document, the whole ecosystem becomes available:

- client generation in any language: [openapi-typescript, Orval, Kiota, Hey API](https://www.pkgpulse.com/guides/orval-vs-openapi-typescript-vs-kubb-openapi-client-2026);
- property-based testing: [Schemathesis](https://pypi.org/project/schemathesis/3.19.5) (stateful, conformance checks);
- linting: [Spectral](https://nordicapis.com/using-spectral-to-lint-your-openapi-definition/);
- mocks / validation proxy: [Prism](https://stoplight.io/open-source/prism);
- breaking-change detection: [oasdiff](https://nordicapis.com/using-oasdiff-to-detect-breaking-changes-in-apis/).

**Decision:** every investigation emits `investigation/openapi.json` (3.1) with
`x-rea-from-api` extensions carrying status, confidence and evidence ids. Official
specs found during discovery are merged into it, not discarded.

## 3. Discovery "connections" beyond a browser

Ranked by value / risk. All are bounded, read-only, and recorded as evidence.

| Source | Why it matters | Mode |
|---|---|---|
| [RFC 9727](https://www.rfc-editor.org/rfc/rfc9727) `/.well-known/api-catalog` (linkset, June 2025) | the standard way a publisher lists its APIs, specs (`service-desc`) and docs (`service-doc`) | target, 1 GET |
| `/llms.txt`, `/.well-known/ai-plugin.json`, `Link: rel=service-desc` headers | sites increasingly publish machine-oriented pointers to their API docs/specs | target, ≤3 GETs |
| [APIs.guru directory](https://jentic.com/apis/apis.guru/apis-guru) `GET /v2/{domain}.json` | thousands of official OpenAPI specs indexed by provider domain, unauthenticated | third-party, 1 GET |
| Wayback Machine CDX API | historical URLs incl. JSON endpoints, without touching the target ([pattern used by gau/waybackurls](https://trickest.com/tools/gau)) | third-party, passive |
| Certificate Transparency (crt.sh) | finds `api.*`, `developer.*`, `docs.*` hosts the page never links to | third-party, passive |
| Framework data conventions | Next.js `/_next/data/<buildId>/…json` ([buildId in HTML](https://nextjs.org/docs/app/api-reference/next-config-js/generateBuildId)), Gatsby `page-data.json`, Nuxt `_payload.json`, SvelteKit `__data.json`, WordPress `wp-json`, [WooCommerce Store API](https://developer.woocommerce.com/docs/apis/store-api/) (public, unauthenticated), Shopify `products.json`, Drupal JSON:API | target, only for the fingerprinted framework |
| Source maps | `sourceMappingURL` → `sourcesContent` recovers the original API client modules | target, same-origin |
| AST JS extraction ([jsluice](https://bishopfox.com/blog/jsluice-javascript-technical-deep-dive)) | follows concatenation/scope; far better than regex | optional external provider |
| GraphQL introspection | one standard query gives the full schema when public | target, 1 POST of the *standard* introspection query only |
| HAR / mitmproxy / SAZ via REA | the user's own authorized session, offline | local |

### Deliberate non-goals (researched, rejected)

- Wordlist brute forcing of routes (kiterunner) or GraphQL fields
  ([Clairvoyance](https://docsearch.algolia.com/mcp/docs/repo/nikitastupin/clairvoyance) / field-suggestion
  abuse): it is active probing of undisclosed surface, i.e. security testing, not
  integration. Out of scope.
- Exploiting framework bugs (e.g. the 2026 Next.js `_next/data` middleware bypass,
  [CVE-2026-44573](https://www.acunetix.com/vulnerabilities/web/next-js-incorrect-authorization-vulnerability-cve-2026-44573/)):
  framework data routes are only used for pages that are already public, and any
  401/403 stops.

## 4. Validation beyond "the code compiles"

1. Built-in replay + schema validation (exists).
2. **Schemathesis** against the exported spec, GET-only, rate-limited, few examples:
   finds params/edge cases the samples never showed.
3. **Drift monitoring**: re-verify later and diff schemas (built-in; oasdiff if present).
4. **Spectral** lint of the exported spec (optional).

## 5. Generation beyond one language

- Built-in zero-dependency TypeScript (exists) and Python (stdlib `urllib` + `TypedDict`).
- Delegation to ecosystem generators from `openapi.json` when present
  (openapi-typescript, Kiota), recorded in the plan.

## 6. Agent surface

MCP tools mirror the CLI: `investigate`, `list_endpoints`, `get_endpoint`,
`get_evidence`, `export_openapi`, `plan_integration`, `generate_integration`,
`validate_integration`, `diff_specs`, `doctor`. Results are bounded summaries with
file paths for the full artifacts (REA does the same with retained evidence).

## Sources

- RFC 9727 api-catalog: https://www.rfc-editor.org/rfc/rfc9727
- APIs.guru: https://jentic.com/apis/apis.guru/apis-guru
- jsluice: https://bishopfox.com/blog/jsluice-javascript-technical-deep-dive
- HAR→OpenAPI tools: https://npmjs.com/package/har-to-openapi, https://pkg.go.dev/github.com/grokify/traffic2openapi, https://docs.rs/crate/mitm2openapi/latest
- Schemathesis: https://pypi.org/project/schemathesis/3.19.5
- oasdiff: https://nordicapis.com/using-oasdiff-to-detect-breaking-changes-in-apis/
- Spectral: https://nordicapis.com/using-spectral-to-lint-your-openapi-definition/
- Prism: https://stoplight.io/open-source/prism
- Client generators: https://www.pkgpulse.com/guides/orval-vs-openapi-typescript-vs-kubb-openapi-client-2026
- Passive URL discovery: https://trickest.com/tools/gau
- WooCommerce Store API: https://developer.woocommerce.com/docs/apis/store-api/
- Next.js buildId: https://nextjs.org/docs/app/api-reference/next-config-js/generateBuildId
- GraphQL introspection/field suggestions: https://escape.tech/blog/should-i-disable-introspection-in-graphql/
