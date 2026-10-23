# Safety and boundaries

rea-from-api is for data the user is authorized to access. These rules are enforced in
code, not only documented.

| Rule | Where |
|---|---|
| Only `GET`/`HEAD` are sent automatically; writes are never replayed or generated | `SafeHttp.request`, `verify`, planner |
| The single exception: the standard GraphQL introspection query (read-only), ≤ 2 endpoints | `GRAPHQL_INTROSPECTION_QUERY`, `graphql.ts` |
| No wordlist brute forcing of routes or GraphQL fields; framework routes only for the fingerprinted framework and the already-public page | `frameworkData.ts`, docs/research.md |
| Passive sources send only the domain to APIs.guru / web.archive.org / crt.sh; `--passive off` disables them | `passiveSources.ts` |
| CT-discovered same-site API hosts are probed only for published descriptions (api-catalog, openapi.json, swagger.json) | `passiveSources.ts` |
| Conformance (Schemathesis) only exercises confirmed GET operations with valid inputs, 2 req/s, 120 s budget | `conformance.ts` |
| robots.txt is honoured for every request the tool issues | `SafeHttp.robots` |
| Override only for caller-declared documented API seeds (`--robots-exempt`), recorded as evidence + limitation | `verify.ts` |
| Account/auth/admin/checkout/delete-like paths are never replayed unless documented | `SENSITIVE_PATH` in `verify.ts` |
| Login redirects mark the endpoint `auth: required` and stop | `verify.ts` |
| Bot challenges / CAPTCHAs stop all requests to that host; no solving, no evasion | `detectChallenge` |
| 429 → honour Retry-After up to 10 s once or twice, otherwise stop the host | `SafeHttp` |
| Request, time, body, script, page budgets with hard ceilings | `limits.ts` |
| URLs with userinfo rejected; sensitive query values, JSON keys and inline secrets redacted everywhere | `redact.ts` |
| Header values never stored (names only); REA redacts transport credentials in captures | `reaBrowser.ts`, REA |
| Cross-origin hosts are observed but not replayed unless `--allow-origin` | `verify.ts` |
| Downloaded JS is parsed as text, never executed by the tool (the browser executes the page as any visitor would) | `jsScan.ts`, REA |
| Site content is data, not instructions; reports escape it | `report.ts`, SKILL.md |
| Generator refuses to overwrite files without `--force` | `writeFiles` |
| Generated clients read tokens only from env, redact logs, bound retries and pagination | `runtime.ts` |

Not implemented, by design: authentication bypass, token/cookie extraction from
browsers, CAPTCHA solving, fingerprint spoofing, IP rotation, exploitation, bulk
personal-data harvesting.

Before relying on an undocumented endpoint or redistributing data, check the site's
terms of use and applicable law; the findings report always repeats this.
