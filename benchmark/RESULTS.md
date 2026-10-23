# Benchmark

rea-from-api 0.3.0, 2026-10-23, browser auto. Each site gets only its URL and a goal: no seeds, no HAR, no key.
**Usable** = endpoints that `plan` would turn into code: confirmed by a real GET, JSON, relevant to the goal.

**5/22 sites** gave at least one usable endpoint (before this round: 3/22).

With the explicit opt-in `--robots-exempt documented` (only routes the site documents itself), 2 more: pypi (4), openmeteo (1).

| Outcome | Sites |
|---|---|
| usable API | 5 (was 3) |
| needs your key | 2 (was 1) |
| found, robots.txt | 2 (was 3) |
| robots.txt blocks the page | 2 (was 2) |
| partial | 3 (was 6) |
| blocked (anti-bot) | 5 (was 5) |
| nothing | 3 (was 2) |

| Site | Kind | Outcome | Usable (before → after) | Confirmed | Time | Best endpoints |
|---|---|---|---|---|---|---|
| pypi | server-rendered, documented API | found, robots.txt | 0 → 0 | 10 | 65s |  |
| npm | React SPA, registry API | blocked (anti-bot) | 0 → 0 | 0 | 64s |  |
| crates | Ember SPA | usable API | 11 → 13 | 14 | 92s | `crates.io/api/v1/crates`<br>`crates.io/api/v1/crates/serde` |
| github | large app, official API | usable API | 0 → 3 | 5 | 137s | `api.github.com/repos/{owner}/{repo}`<br>`api.github.com/events` |
| gitlab | Rails + Vue, official API | blocked (anti-bot) | 0 → 0 | 1 | 147s |  |
| wikipedia | MediaWiki, REST + action API | nothing | 0 → 0 | 1 | 103s |  |
| hackernews | plain HTML, API on another origin | nothing | 0 → 0 | 1 | 119s |  |
| hn-algolia | SPA calling a search service | partial | 0 → 0 | 2 | 71s |  |
| lobsters | Rails with .json routes | robots.txt blocks the page | 0 → 0 | 0 | 41s |  |
| devto | Rails (Forem), public API | usable API | 6 → 5 | 6 | 61s | `dev.to/api/articles/latest`<br>`dev.to/api/articles` |
| stackoverflow | server-rendered, Stack Exchange API | blocked (anti-bot) | 0 → 0 | 0 | 45s |  |
| reddit | anti-bot heavy | robots.txt blocks the page | 0 → 0 | 0 | 24s |  |
| openmeteo | API product with docs | found, robots.txt | 0 → 0 | 1 | 48s |  |
| openstreetmap | map app, documented API | partial | 0 → 0 | 4 | 97s |  |
| archive | large archive, many APIs | usable API | 2 → 3 | 7 | 129s | `archive.org/services/offshoot/abtest.php`<br>`archive.org/metadata/ymfubmvyx3b1ymxpyw/metadata` |
| nextjs | Next.js marketing site | partial | 0 → 0 | 12 | 86s |  |
| dados-gov-br | government open data (CKAN) | needs your key | 0 → 0 | 1 | 79s |  |
| ibge | government site, separate data API | blocked (anti-bot) | 0 → 0 | 0 | 67s |  |
| bcb | Angular SPA, central bank | usable API | 0 → 3 | 25 | 50s | `www.bcb.gov.br/api/servico/sitebcb/indicadorCambio`<br>`www.bcb.gov.br/api/servico/sitebcb/taxaselic/ultima` |
| mercadolivre | e-commerce, anti-bot | nothing | 0 → 0 | 1 | 35s |  |
| coingecko | crypto prices, Cloudflare | blocked (anti-bot) | 0 → 0 | 0 | 32s |  |
| tmdb | API requires a key | needs your key | 0 → 0 | 7 | 63s |  |

Outcomes: *found, robots.txt* means the site's own docs describe the API but its robots.txt asks crawlers not to call it;
it is verified only with an explicit `--robots-exempt`. *Needs your key* means the documented API answers 401/403: run again with `--auth-env`. *Blocked* means a bot challenge stopped the run (never bypassed). *robots.txt blocks the page* means the site asks crawlers to stay off the page itself, so the run stops there.

Reproduce: `node benchmark/run.mjs` (about 15 minutes, a few hundred GET requests spread over the sites), then `node benchmark/report.mjs`.
