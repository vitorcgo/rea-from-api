# How rea-from-api uses REA

`src/rea/reaCli.ts` is the only module that talks to REA. It resolves the binary from
`$REA_BIN`, `node_modules/.bin/rea` (installed via the optional dependency
`rea-agents@6.7.0`) or `PATH`, and parses REA's Evidence JSON (`evidence_id`,
`normalized_result`, `limitations`).

| rea-from-api strategy | REA command | What we read |
|---|---|---|
| `rea-browser` | `capture-browser-scenario <file>` (launch mode, provider-owned profile) | `events.items[]` request/response/network-content (base64 bodies, media type, sha256) |
| `rea-bundle` | `list-browser-targets` + `analyze-web-bundle <cdp> <target>` | `inferences[kind=endpoint_candidate]`, `observations.endpoints` |
| `har` | `inspect-web-network-capture <abs path> har` | `records[].reported.request/response` (REA nulls credential header values) |
| `doctor` | `--version` | availability |

The scenario used by `rea-browser`:

```json
{
  "browser": { "mode": "launch", "executable_path": "<chromium or proxy wrapper>" },
  "start_url": { "url": "<target>" },
  "actions": [
    { "step_id": "settle", "action": "wait_for_timeout", "duration_ms": 2500 },
    { "step_id": "scroll", "action": "press", "locator": { "kind": "css", "selector": "body" }, "key": "End", "timeout_ms": 5000 },
    { "step_id": "settle-after-scroll", "action": "wait_for_timeout", "duration_ms": 2000 }
  ],
  "capture": {
    "at_end": ["url"], "events": ["network"],
    "network": { "response_body": true, "request_body": true, "header_values": false },
    "limits": { "max_network_body_bytes": 262144, "max_network_transactions": 400 }
  }
}
```

`header_values: false` keeps header values out of the capture entirely; only names
are used.

## Environment requirements

- Node ≥ 22.18 (REA requires ^22.19 or ≥ 24.11 per its `engines`; 22.22 tested).
- A Chromium-family browser: `$REA_FROM_API_CHROMIUM`, `$CHROME_PATH`, Playwright's
  cache (`$PLAYWRIGHT_BROWSERS_PATH`, `/opt/pw-browsers`, `~/.cache/ms-playwright`) or
  `chromium`/`google-chrome` on PATH. Nothing is downloaded automatically.
- With `HTTPS_PROXY` set, Chromium is started through a wrapper adding `--proxy-server`.

## When REA is unavailable

`rea-browser`, `rea-bundle` and `har` report `unavailable` with the reason; the
remaining strategies run, and findings list what could not be observed (for SPAs
this usually means XHR endpoints remain *inferred* from JS instead of *observed*).

## Going further with REA directly

For Electron/desktop apps, Android packages or native binaries, use REA's own skill
(`reverse-engineer-anything`) and MCP server (`rea setup`). Endpoints found that way can
be fed back with `--seed` or `--har`.
