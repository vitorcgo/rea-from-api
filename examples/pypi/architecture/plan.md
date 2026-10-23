# Integration plan: pypi-json

Goal: public package metadata

Strategy: **json-api** · language: typescript

## Sources

- `getPypiByProjectVersion` ← `GET https://pypi.org/pypi/{project}/{version}/json` (documented, confirmed, auth none)
- `getPypi` ← `GET https://pypi.org/pypi/{project}/json` (documented, confirmed, auth none)

## Execution order

1. getPypiByProjectVersion
2. getPypi

## Transformations

- none

## Errors, retries, cache, rate limit

- HttpError (non-2xx) with status, retryable flag and redacted URL
- ValidationError when a response no longer matches the observed schema (format drift)
- TimeoutError per request (AbortSignal)
- bounded retries with exponential backoff for network errors, 429 (honouring Retry-After up to a cap) and 502/503/504
- cache: memory-ttl, default TTL 60000 ms
- pacing: 500 ms between requests (no rate-limit headers observed; conservative default of 2 req/s)

## Authentication

- Selected endpoints answered without credentials during verification.

## Target

- kind: none; output: `integration`
- No target project given: a standalone package is generated.

## Risks

- Respect the site's terms of use, robots.txt and rate limits; confirm that reuse/redistribution of the data is permitted.

## Excluded endpoints

- get-02a0d3ec: not confirmed (observed, test skipped-cross-origin)
- get-171be125: not confirmed (observed, test skipped-cross-origin)
- get-7ec9e483: not confirmed (observed, test skipped-cross-origin)
- get-b0a2c059: response format binary
- get-0ff29434: response format html
- get-cfef48a4: response format xml
- get-4ad0157e: response format xml
- get-f7644fe6: response format xml
- get-60d9518f: response format xml
- get-677cafd7: response format xml
- get-8681cd49: response format xml
- get-837992e9: response format xml
- get-aa82a775: response format html
- get-7573cdc5: not confirmed (inferred, test skipped-cross-origin)
- get-c8496205: not confirmed (unavailable, test failed)
- get-88845aca: not confirmed (unavailable, test skipped-robots)

## Diagram

```mermaid
flowchart LR
  consumer["Consumer code (examples/)"]
  cache[("In-memory TTL cache<br/>60s")]
  client["HTTP client<br/>timeout · bounded retry · 500ms pacing"]
  src_getPypiByProjectVersion[/"GET pypi.org/pypi/{project}/{version}/json<br/>documented · confirmed"/]
  fn_getPypiByProjectVersion["getPypiByProjectVersion()"]
  val_getPypiByProjectVersion{{"validate PypiByProjectVersionResponse"}}
  src_getPypiByProjectVersion --> client --> val_getPypiByProjectVersion --> fn_getPypiByProjectVersion
  fn_getPypiByProjectVersion <--> cache
  fn_getPypiByProjectVersion --> consumer
  src_getPypi[/"GET pypi.org/pypi/{project}/json<br/>documented · confirmed"/]
  fn_getPypi["getPypi()"]
  val_getPypi{{"validate PypiResponse"}}
  src_getPypi --> client --> val_getPypi --> fn_getPypi
  fn_getPypi <--> cache
  fn_getPypi --> consumer
```
