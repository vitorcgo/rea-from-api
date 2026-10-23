# Audit of REA (Reverse Engineer Anything)

Audited: `github.com/morluto/rea` at commit `c106cf2` (2026-10), npm `rea-agents@6.7.0`.
Everything marked ✅ below was **executed in this environment**, not just read.

## License

- REA: **MIT**, © 2026 morluto (`LICENSE`). rea-from-api uses REA as an unmodified npm
  dependency and invokes its CLI; no REA source is copied. See `THIRD_PARTY_NOTICES.md`.
- REA's own `THIRD_PARTY_NOTICES.md` inventories its dependencies (npm runtime deps
  are permissive; optional `frida` is LGPL-2.0 with WxWindows exception; Ghidra, JEB,
  Hopper, IDA etc. are *separately obtained* engines, not bundled).
- REA's `DISCLAIMER.md` restricts use to lawful/authorized analysis and excludes
  bypassing auth, bot protection or access controls; rea-from-api adopts the same line.

## Structure (relevant parts)

| Area | Path | Notes |
|---|---|---|
| CLI + MCP server | `scripts/rea.mjs`, `src/server/*` | One `rea` binary; every MCP tool has a CLI twin returning Evidence JSON |
| Agent skill | `.agents/skills/reverse-engineer-anything/SKILL.md` | Instructions only; does not install engines or register MCP |
| Browser (CDP, passive) | `src/browser/*`, `docs/browser-observation.md` | Attach to a user-owned Chrome via CDP |
| Browser scenarios | `PlaywrightBrowserScenarioProvider.ts`, `docs/browser-scenario-contract.md` | Launch/connect, declarative actions, network capture incl. bodies |
| HAR/SAZ/mitmproxy | `docs/web-network-captures.md` | Offline inspection, credential redaction |
| JS/Electron | `analyze-javascript-application`, `analyze-web-bundle`, `export-web-scripts` | Static AST analysis without execution |
| Native/binary | Ghidra, Hopper, IDA, Rizin, Frida, JADX, apktool… | Require external installs |

## Capabilities verified here

| REA command | Result | Used by rea-from-api |
|---|---|---|
| `rea --version`, `doctor`, `capabilities` | ✅ runs on Node 22.22 | `doctor` |
| `capture-browser-scenario` (launch mode) | ✅ captured fetch/XHR + response bodies on a local fixture and on pypi.org | `rea-browser` strategy |
| `list-browser-targets` + `analyze-web-bundle` | ✅ against a Chromium started with `--remote-debugging-port` | `rea-bundle` strategy |
| `inspect-web-network-capture … har` | ✅ parsed HAR, redacted `Authorization` value | `har` strategy |
| Ghidra/Frida/JEB/IDA/Hopper tools | ⚠️ not exercised: need external engines | not needed for web data discovery |

## Gaps and limitations found (by running, not reading)

1. **Launch mode has no proxy option.** In proxied environments Chromium cannot reach
   the internet. rea-from-api passes a tiny wrapper script as `executable_path` that adds
   `--proxy-server` (and `--no-sandbox` as root). REA still owns lifecycle and cleanup.
2. **`analyze-web-bundle` misses concatenated URLs.** On
   `fetch(API + "/products/" + id)` and `fetch("/api/v2/products?page=" + p)` it
   reported only the literal `axios.get("/api/v2/categories")`. rea-from-api adds a
   lightweight string-literal scanner (`js-static`) and keeps both results as *inferred*.
3. **`analyze-web-bundle` needs an existing CDP target** (passive by design). rea-from-api
   starts a throwaway headless Chromium with its own profile, then deletes it.
4. **Connect mode marks events incomplete** (`missing.push("events")` for attached
   sessions), so launch mode is used for traffic capture.
5. REA does not replay or validate endpoints, infer JSON schemas, detect pagination,
   plan integrations or generate clients. That is exactly the layer rea-from-api adds.
6. Documented in REA but environment-dependent: packet captures (`tshark`), WASM
   (`wabt`), Android (`adb`/`apktool`/JADX), native decompilers. Not required here.

## Reuse decisions

- **Reuse, don't duplicate:** browser automation + network/body capture, bundle AST
  analysis and HAR parsing are delegated to REA through its CLI (`src/rea/reaCli.ts`).
- **Separate layer:** no REA files are modified; REA is a pinned optional dependency.
  If it is absent, strategies report `unavailable` with the install command and the
  static strategies continue.
- **MCP:** REA's MCP server can still be registered next to this skill for deeper
  manual work (Electron apps, binaries); rea-from-api calls the CLI so it works in any
  agent without MCP registration.
