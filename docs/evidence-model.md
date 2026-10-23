# Evidence model

All types: `src/core/types.ts`.

## `investigation/endpoints.json`: `EndpointRecord[]`

| Field | Meaning |
|---|---|
| `id` | stable hash of method + origin + path shape |
| `urlTemplate` / `exampleUrl` | template with `{params}`; concrete URL (sensitive query values redacted) |
| `discoveredBy` / `evidenceIds` | strategies and evidence records supporting it |
| `purpose` | from the spec when documented, otherwise "(inferred from URL shape)" |
| `pathParams`, `queryParams[]` | `role`: pagination/filter/sort/search/identifier; sensitive names never keep examples |
| `requiredHeaders` | header **names** only |
| `auth` | `none` (answered without credentials) · `required` (401/403/login redirect/spec security) · `unknown` |
| `responseFormat`, `contentType`, `schema` | schema inferred from observed bodies only |
| `pagination` | style + `basis` explaining why, incl. whether page 2 was fetched and differed |
| `rateLimit`, `errorsObserved` | headers and statuses seen |
| `status` | `confirmed` · `observed` · `inferred` · `unavailable` |
| `testStatus` | `passed` · `failed` · `not-tested` · `skipped-*` (unsafe-method, sensitive-path, robots, budget, template, cross-origin) |
| `confidence` | high (confirmed JSON) · medium · low |
| `verifiedAt`, `documented`, `goalRelevance`, `notes` | |

Status only moves *up* through merges (inferred → observed → confirmed); `verify`
can move it to `unavailable` when a replay fails.

## `investigation/evidence.json`: `EvidenceRecord[]`

`id`, `at`, `strategy`, `kind` (http-response, browser-capture, static-js,
html-analysis, spec, robots, rea-evidence, har, verification, note), `source`,
`summary`, `sha256` of the bytes the claim is based on, `status`, `contentType`,
a redacted ≤300-char `excerpt`, `reaEvidenceId` linking to REA's own Evidence object,
and `samplePath` (redacted JSON in `samples/`).

## `investigation/openapi.json`: OpenAPI 3.1

Confirmed, observed and documented operations become `paths`; weaker candidates are listed under
`x-rea-from-api-candidates`. Each operation has `x-rea-from-api` with `id`, `status`, `testStatus`,
`confidence`, `documented`, `discoveredBy`, `evidenceIds`, `verifiedAt`, `goalRelevance` and, when
known, `pagination`, `rateLimitHeaders`, `headerNames`. Parameter examples come from verified
requests; response examples are trimmed samples. Other origins use path-level `servers`.

## Other files

- `investigation.json`: everything above plus app type, tech hints, embedded blocks,
  strategy runs, limitations, budget used.
- `progress.jsonl`: timestamped log of every request (URL redacted) and step.
- `findings.md`: human report; site strings are escaped and treated as data.
- `architecture/plan.json|plan.md|flow.mmd|data-models.ts`: the plan, its diagram
  and inferred types.
- `validation.json|validation.md`: every check with command, duration and output.
