# Third-party notices

rea-from-api's own code is MIT (see `LICENSE`). It contains no copied third-party
source code. The components below are used as separately installed dependencies and
keep their own licenses.

## REA: Reverse Engineer Anything (`rea-agents@6.7.0`, optional dependency)

Invoked through its CLI (`capture-browser-scenario`, `analyze-web-bundle`,
`list-browser-targets`, `inspect-web-network-capture`). Not modified, not vendored.
REA's own dependency and engine notices are in its package
(`node_modules/rea-agents/THIRD_PARTY_NOTICES.md`, `licenses/`), including the
LGPL-2.0-with-exception optional `frida` dependency, which rea-from-api does not use.

```
MIT License

Copyright (c) 2026 morluto

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

REA's `DISCLAIMER.md` limits use to lawful, authorized analysis; rea-from-api follows the
same boundaries (see `docs/safety.md`).

## Runtime npm dependencies

- `@modelcontextprotocol/sdk@1.32.1`: MIT, © Anthropic, PBC (MCP server/client).
- `zod@4`: MIT, © Colin McDonnell (MCP input schemas).
- `yaml@2.9.1`: ISC, © Eemeli Aro (YAML OpenAPI documents).

Their transitive dependencies keep their own licenses (see `node_modules/*/LICENSE`).

## Development dependencies

- `typescript@5.9.3`: Apache-2.0, © Microsoft Corporation.
- `@types/node@22.20.5`: MIT, © DefinitelyTyped contributors.
- `@seriousme/openapi-schema-validator@2.11.0`: MIT (validates exported OpenAPI in tests).

## Optional external engines (detected, never bundled or auto-installed)

| Engine | License | Used for |
|---|---|---|
| [jsluice](https://github.com/BishopFox/jsluice) | MIT, © 2023 Bishop Fox | AST extraction of URLs/methods/headers from JavaScript |
| [Schemathesis](https://github.com/schemathesis/schemathesis) | MIT | property-based conformance tests of the exported OpenAPI |
| [oasdiff](https://github.com/oasdiff/oasdiff) | Apache-2.0 | breaking-change classification in `diff`/`monitor` |
| [mypy](https://github.com/python/mypy) | MIT | typechecking generated Python clients |

## Third-party data services (passive discovery; only the domain name is sent)

- [APIs.guru](https://apis.guru) OpenAPI directory; spec licenses vary per API.
- [Internet Archive Wayback Machine](https://web.archive.org) CDX API; subject to the Internet Archive's terms.
- [crt.sh](https://crt.sh) Certificate Transparency search, operated by Sectigo.

## Runtime environment (not distributed)

- Chromium / Playwright browsers: BSD-3-Clause and component licenses; supplied by
  the user's environment, never downloaded by rea-from-api.
- Generated integrations have **no runtime dependencies** beyond Node.js (TypeScript) or the Python standard library.

## Example data

`examples/pypi/` contains excerpts of public responses from pypi.org (package
metadata for `requests`), retained as evidence and test fixtures. PyPI metadata is
provided by the Python Software Foundation; check PyPI's terms before redistributing
larger amounts of data.
