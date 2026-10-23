// Python generator: standard library only (urllib, json, typing, unittest).
// Mirrors the TypeScript generator's behaviour: timeouts, bounded retries,
// pacing, TTL cache, redacted logs, observed-shape validation, bounded pagination.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { JsonSchema } from "../core/types.ts";
import type { IntegrationPlan, PlanSource, PlanEmbeddedSource } from "../plan/planner.ts";
import { renderMermaid, constName } from "../plan/planner.ts";
import { redactJson } from "../core/redact.ts";
import { trimSample, type GeneratedFile, type GenerateOptions } from "./typescript.ts";

const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_").toLowerCase().replace(/^_|_$/g, "");
const pyStr = (s: string) => JSON.stringify(s);
const PY_KEYWORDS = new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield type id".split(" "));
const pyIdent = (s: string) => {
  const v = snake(s) || "value";
  return /^\d/.test(v) || PY_KEYWORDS.has(v) ? `${v}_` : v;
};

export function pyPackageName(plan: IntegrationPlan): string {
  return snake(plan.name).replace(/^(\d)/, "_$1") || "integration";
}

// ---- types -------------------------------------------------------------------

class TypeEmitter {
  defs: string[] = [];
  private used = new Set<string>();

  name(base: string): string {
    let n = base.replace(/[^A-Za-z0-9]/g, "") || "Model";
    let i = 2;
    while (this.used.has(n)) n = `${base}${i++}`;
    this.used.add(n);
    return n;
  }

  type(s: JsonSchema | undefined, hint: string): string {
    if (!s) return "Any";
    const base = (() => {
      if (s.anyOf?.length) return `Union[${s.anyOf.map((v, i) => this.type(v, `${hint}V${i}`)).join(", ")}]`;
      switch (s.type) {
        case "string":
          return "str";
        case "integer":
          return "int";
        case "number":
          return "float";
        case "boolean":
          return "bool";
        case "null":
          return "None";
        case "array":
          return `List[${this.type(s.items, `${hint}Item`)}]`;
        case "object": {
          if (s.additionalProperties) return `Dict[str, ${this.type(s.additionalProperties, `${hint}Value`)}]`;
          const props = Object.entries(s.properties ?? {});
          if (!props.length) return "Dict[str, Any]";
          const name = this.name(hint);
          const req = new Set(s.required ?? []);
          const fields = props.map(([k, v]) => {
            const t = this.type(v, `${hint}${k.replace(/(^|[_\W])(\w)/g, (_m, _a, c: string) => c.toUpperCase())}`);
            return `    ${pyStr(k)}: ${req.has(k) ? `Required[${t}]` : t},`;
          });
          this.defs.push(`${name} = TypedDict(${pyStr(name)}, {\n${fields.join("\n")}\n}, total=False)`);
          return name;
        }
        default:
          return "Any";
      }
    })();
    return s.nullable && s.type !== "null" ? `Optional[${base}]` : base;
  }
}

function validator(name: string, s: JsonSchema | undefined): string {
  const body = check(s, "value", "$", 1);
  return `def validate_${snake(name)}(value: Any) -> ${name}:\n${body || "    pass\n"}    return value  # type: ignore[return-value]\n`;
}

function check(s: JsonSchema | undefined, expr: string, path: string, depth: number): string {
  if (!s || depth > 6 || s.type === "unknown" || s.anyOf) return "";
  const pad = "    ".repeat(depth);
  const p = pyStr(path);
  const guard = s.nullable ? `${expr} is not None and ` : "";
  switch (s.type) {
    case "string":
      return `${pad}if ${guard}not isinstance(${expr}, str):\n${pad}    _fail(${p}, "string", ${expr})\n`;
    case "boolean":
      return `${pad}if ${guard}not isinstance(${expr}, bool):\n${pad}    _fail(${p}, "boolean", ${expr})\n`;
    case "integer":
    case "number":
      return `${pad}if ${guard}(isinstance(${expr}, bool) or not isinstance(${expr}, (int, float))):\n${pad}    _fail(${p}, "number", ${expr})\n`;
    case "array": {
      let out = `${pad}if ${guard}not isinstance(${expr}, list):\n${pad}    _fail(${p}, "array", ${expr})\n`;
      const inner = check(s.items, `item${depth}`, `${path}[]`, depth + 1);
      if (inner) out += `${pad}if isinstance(${expr}, list):\n${pad}    for item${depth} in ${expr}:\n${inner.replace(/^(?=.)/gm, "    ")}`;
      return out;
    }
    case "object": {
      let out = `${pad}if ${guard}not isinstance(${expr}, dict):\n${pad}    _fail(${p}, "object", ${expr})\n`;
      if (s.additionalProperties) {
        const inner = check(s.additionalProperties, `entry${depth}`, `${path}.*`, depth + 2);
        if (inner) out += `${pad}if isinstance(${expr}, dict):\n${pad}    for entry${depth} in ${expr}.values():\n${inner}`;
        return out;
      }
      const req = new Set(s.required ?? []);
      const parts: string[] = [];
      for (const [k, v] of Object.entries(s.properties ?? {})) {
        const child = `${expr}[${pyStr(k)}]`;
        const sub = check(v, child, `${path}.${k}`, depth + 2);
        if (req.has(k)) {
          parts.push(`${pad}    if ${pyStr(k)} not in ${expr}:\n${pad}        _fail(${pyStr(`${path}.${k}`)}, "present", None)\n`);
          if (sub) parts.push(`${pad}    else:\n${sub}`);
        } else if (sub) parts.push(`${pad}    if ${pyStr(k)} in ${expr}:\n${sub}`);
      }
      if (parts.length) out += `${pad}if isinstance(${expr}, dict):\n${parts.join("")}`;
      return out;
    }
    default:
      return "";
  }
}

// ---- files -------------------------------------------------------------------

export function generatePython(plan: IntegrationPlan, opts: GenerateOptions): GeneratedFile[] {
  if (plan.strategy === "none") throw new Error("plan has no usable sources; nothing to generate");
  const pkg = pyPackageName(plan);
  const env = constName(plan.name);
  const files: GeneratedFile[] = [];
  const add = (path: string, content: string) => files.push({ path, content });
  const samples = loadSamples(plan, opts.investigationDir);
  const all: (PlanSource | PlanEmbeddedSource)[] = [...plan.sources, ...plan.embedded];

  const te = new TypeEmitter();
  const roots = all.map((s) => {
    const t = te.type(s.schema, s.typeName.replace(/Response$/, "Data"));
    return `${s.typeName} = ${t}`;
  });
  add(
    `${pkg}/models.py`,
    `"""Types and validators inferred from responses observed by rea-from-api.

They describe what was seen, not a documented contract. ValidationError means
the source changed (format drift).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

try:
    from typing import Required, TypedDict
except ImportError:  # Python < 3.11
    from typing_extensions import Required, TypedDict  # type: ignore

from .errors import ValidationError


def _fail(path: str, expected: str, got: Any) -> None:
    raise ValidationError(path, expected, got)


${te.defs.join("\n\n")}

${roots.join("\n")}


${all.map((s) => validator(s.typeName, s.schema)).join("\n\n")}`,
  );

  add(`${pkg}/errors.py`, PY_ERRORS);
  add(`${pkg}/http.py`, PY_HTTP);
  add(`${pkg}/config.py`, pyConfig(plan, env));
  add(`${pkg}/client.py`, pyClient(plan));
  add(`${pkg}/__init__.py`, `"""${plan.name}: generated by rea-from-api for ${plan.sourceUrl}"""\nfrom .client import Client\nfrom .config import Config\nfrom .errors import HttpError, IntegrationError, TimeoutError, ValidationError\n\n__all__ = ["Client", "Config", "HttpError", "IntegrationError", "TimeoutError", "ValidationError"]\n`);
  for (const [fn, data] of samples) add(`tests/fixtures/${fn}.json`, `${JSON.stringify(data, null, 2)}\n`);
  add("tests/__init__.py", "");
  add("tests/test_models.py", pyModelTests(plan, pkg, samples));
  add("tests/test_client.py", pyClientTests(plan, pkg, samples));
  add("tests/test_live.py", pyLiveTests(plan, pkg));
  add("examples/basic.py", pyExample(plan, pkg));
  add("architecture/flow.mmd", renderMermaid(plan));
  add(".env.example", [`${env}_BASE_URL=`, `${env}_TIMEOUT=15`, `${env}_MAX_RETRIES=2`, `${env}_MIN_INTERVAL=${plan.rateLimit.minIntervalMs / 1000}`, ...(plan.auth.required ? [`${plan.auth.envVar}=`] : []), ""].join("\n"));
  add("README.md", pyReadme(plan, pkg));
  if (opts.standalone)
    add("pyproject.toml", `[project]\nname = "${plan.name}"\nversion = "0.1.0"\nrequires-python = ">=3.9"\ndependencies = []\n\n[project.optional-dependencies]\nlegacy = ["typing_extensions>=4.0"]\n\n[tool.setuptools]\npackages = ["${pkg}"]\n`);
  return files;
}

function loadSamples(plan: IntegrationPlan, invDir: string): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const s of plan.sources) {
    const p = join(invDir, "investigation", "samples", `endpoint-${s.endpointId}.json`);
    if (existsSync(p)) out.set(s.fnName, trimSample(redactJson(JSON.parse(readFileSync(p, "utf8")))));
  }
  for (const e of plan.embedded) {
    if (!e.sampleFile) continue;
    const p = join(invDir, "investigation", e.sampleFile);
    if (existsSync(p)) out.set(e.fnName, trimSample(redactJson(JSON.parse(readFileSync(p, "utf8")))));
  }
  return out;
}

const PY_ERRORS = `class IntegrationError(Exception):
    pass


class HttpError(IntegrationError):
    def __init__(self, status: int, url: str, retryable: bool) -> None:
        super().__init__(f"HTTP {status} for {url}")
        self.status = status
        self.url = url
        self.retryable = retryable


class TimeoutError(IntegrationError):  # noqa: A001 - mirrors the TS client
    pass


class ValidationError(IntegrationError):
    """The response no longer matches the shape observed during investigation."""

    def __init__(self, path: str, expected: str, got: object) -> None:
        kind = "null" if got is None else type(got).__name__
        super().__init__(f"Response validation failed at {path}: expected {expected}, got {kind}")
        self.path = path
`;

const PY_HTTP = `"""Read-only HTTP client: timeouts, bounded retries, pacing, TTL cache, redacted logs."""
from __future__ import annotations

import json
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional, Tuple

from .config import Config
from .errors import HttpError, IntegrationError, TimeoutError

RETRYABLE = {429, 502, 503, 504}
SENSITIVE = re.compile(r"^(token|access_token|api_?key|key|sig|signature|auth|session|password)$", re.I)


def redact(url: str) -> str:
    parts = urllib.parse.urlsplit(url)
    query = [(k, "[REDACTED]" if SENSITIVE.match(k) else v) for k, v in urllib.parse.parse_qsl(parts.query, keep_blank_values=True)]
    netloc = parts.hostname or ""
    if parts.port:
        netloc += f":{parts.port}"
    return urllib.parse.urlunsplit((parts.scheme, netloc, parts.path, urllib.parse.urlencode(query), ""))


class HttpClient:
    def __init__(self, config: Config) -> None:
        self.config = config
        self._last = 0.0
        self._cache: Dict[str, Tuple[float, Any]] = {}

    def clear_cache(self) -> None:
        self._cache.clear()

    def get(self, url: str, accept: str = "application/json", fresh: bool = False) -> Tuple[Any, Dict[str, str]]:
        if not fresh and self.config.cache_ttl > 0:
            hit = self._cache.get(url)
            if hit and hit[0] > time.monotonic():
                return hit[1]
        result = self._get(url, accept)
        if self.config.cache_ttl > 0:
            if len(self._cache) >= 500:
                self._cache.pop(next(iter(self._cache)))
            self._cache[url] = (time.monotonic() + self.config.cache_ttl, result)
        return result

    def _get(self, url: str, accept: str) -> Tuple[Any, Dict[str, str]]:
        attempt = 0
        while True:
            self._pace()
            headers = {"Accept": accept, "User-Agent": self.config.user_agent}
            if self.config.token:
                headers["Authorization"] = f"Bearer {self.config.token}"
            req = urllib.request.Request(url, headers=headers, method="GET")
            try:
                with urllib.request.urlopen(req, timeout=self.config.timeout) as res:
                    body = res.read()
                    hdrs = {k.lower(): v for k, v in res.headers.items()}
                    self._log("ok", url, str(res.status))
                    if "json" in hdrs.get("content-type", "") or "json" in accept:
                        try:
                            return json.loads(body.decode("utf-8")), hdrs
                        except ValueError as exc:
                            raise IntegrationError(f"invalid JSON from {redact(url)}") from exc
                    return body.decode("utf-8", "replace"), hdrs
            except urllib.error.HTTPError as exc:
                retryable = exc.code in RETRYABLE
                wait = _retry_after(exc.headers.get("retry-after")) if exc.code == 429 else _backoff(attempt + 1)
                if retryable and attempt < self.config.max_retries and wait <= self.config.max_retry_after:
                    attempt += 1
                    self._log("retry", url, f"HTTP {exc.code}")
                    time.sleep(wait)
                    continue
                raise HttpError(exc.code, redact(url), retryable) from None
            except (urllib.error.URLError, socket.timeout, ConnectionError) as exc:
                timeout = isinstance(exc, socket.timeout) or "timed out" in str(exc)
                if attempt < self.config.max_retries:
                    attempt += 1
                    self._log("retry", url, "timeout" if timeout else str(exc))
                    time.sleep(_backoff(attempt))
                    continue
                if timeout:
                    raise TimeoutError(f"timeout after {self.config.timeout}s: {redact(url)}") from None
                raise IntegrationError(f"network error for {redact(url)}: {exc}") from None

    def _pace(self) -> None:
        wait = self.config.min_interval - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()

    def _log(self, kind: str, url: str, detail: str) -> None:
        if self.config.logger:
            self.config.logger(f"[{kind}] {redact(url)} {detail}")


def _retry_after(value: Optional[str]) -> float:
    try:
        return float(value) if value else 1.0
    except ValueError:
        return 1.0


def _backoff(attempt: int) -> float:
    return min(8.0, 0.25 * 2 ** (attempt - 1))
`;

function pyConfig(p: IntegrationPlan, env: string): string {
  return `from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Callable, Optional


def _num(name: str, default: float) -> float:
    try:
        return float(os.environ[name])
    except (KeyError, ValueError):
        return default


@dataclass
class Config:
    """Runtime configuration. Secrets only come from the environment."""

    base_url: Optional[str] = field(default_factory=lambda: os.environ.get("${env}_BASE_URL") or None)
    timeout: float = field(default_factory=lambda: _num("${env}_TIMEOUT", 15))
    max_retries: int = field(default_factory=lambda: int(_num("${env}_MAX_RETRIES", 2)))
    max_retry_after: float = 10.0
    # ${p.rateLimit.basis}
    min_interval: float = field(default_factory=lambda: _num("${env}_MIN_INTERVAL", ${p.rateLimit.minIntervalMs / 1000}))
    cache_ttl: float = field(default_factory=lambda: _num("${env}_CACHE_TTL", ${p.cache.defaultTtlMs / 1000}))
    user_agent: str = "${p.name}-integration/0.1 (generated by rea-from-api)"
    token: Optional[str] = field(default_factory=lambda: ${p.auth.required ? `os.environ.get(${pyStr(p.auth.envVar ?? "")}) or None` : "None"})
    logger: Optional[Callable[[str], None]] = None
`;
}

function pyClient(p: IntegrationPlan): string {
  const imports = [...p.sources, ...p.embedded].flatMap((s) => [s.typeName, `validate_${snake(s.typeName)}`]);
  const L = [
    `"""Client for ${p.sourceUrl}. Generated by rea-from-api from verified observations."""`,
    "from __future__ import annotations",
    "",
    "import json",
    "import re",
    "import urllib.parse",
    "from typing import Any, Dict, Iterator, Optional, Union",
    "",
    "from .config import Config",
    "from .errors import IntegrationError",
    "from .http import HttpClient",
    `from .models import (${imports.join(", ")})`,
    "",
    "Scalar = Union[str, int, float]",
    "",
    "",
    "def _at(value: Any, path: str) -> Any:",
    "    for key in [k for k in path.split('.') if k]:",
    "        value = value.get(key) if isinstance(value, dict) else None",
    "    return value",
    "",
    "",
    "class Client:",
    "    def __init__(self, config: Optional[Config] = None, **overrides: Any) -> None:",
    "        self.config = config or Config()",
    "        for k, v in overrides.items():",
    "            setattr(self.config, k, v)",
    "        self.http = HttpClient(self.config)",
    "",
    "    def clear_cache(self) -> None:",
    "        self.http.clear_cache()",
    "",
    "    def _url(self, template: str, path: Dict[str, Scalar], query: Dict[str, Optional[Scalar]]) -> str:",
    "        def sub(m: 're.Match[str]') -> str:",
    "            if m.group(1) not in path:",
    "                raise IntegrationError(f'missing path parameter {m.group(1)}')",
    "            return urllib.parse.quote(str(path[m.group(1)]), safe='')",
    "        url = re.sub(r'\\{(\\w+)\\}', sub, template)",
    "        if self.config.base_url:",
    "            parts = urllib.parse.urlsplit(url)",
    "            url = self.config.base_url.rstrip('/') + parts.path + (f'?{parts.query}' if parts.query else '')",
    "        q = {k: str(v) for k, v in query.items() if v is not None and v != ''}",
    "        if q:",
    "            url += ('&' if '?' in url else '?') + urllib.parse.urlencode(q)",
    "        return url",
    "",
  ];
  for (const s of p.sources) {
    const fn = pyIdent(s.fnName);
    const pathArgs = s.pathParams.map((x) => `${pyIdent(x)}: Scalar`);
    const qArgs = s.queryParams.map((q) => `${pyIdent(q.name)}: Optional[Scalar] = None`);
    const sig = ["self", ...pathArgs, ...(qArgs.length ? ["*", ...qArgs] : []), ...(qArgs.length ? [] : ["*"]), "fresh: bool = False"].join(", ");
    const pathDict = `{${s.pathParams.map((x) => `${pyStr(x)}: ${pyIdent(x)}`).join(", ")}}`;
    const qDict = `{${s.queryParams.map((q) => `${pyStr(q.name)}: ${pyIdent(q.name)}`).join(", ")}}`;
    L.push(
      `    def ${fn}(${sig}) -> ${s.typeName}:`,
      `        """GET ${s.urlTemplate} (${s.documented ? "documented" : "undocumented, observed"}; ${s.status} at generation)."""`,
      `        url = self._url(${pyStr(s.urlTemplate)}, ${pathDict}, ${qDict})`,
      `        data, _ = self.http.get(url, fresh=fresh)`,
      `        return validate_${snake(s.typeName)}(data)`,
      "",
    );
    const pg = s.pagination;
    if (!pg) continue;
    // Page/offset/cursor iteration needs the paging param to be a known keyword argument.
    if ((pg.style === "page" || pg.style === "offset" || pg.style === "cursor") && !s.queryParams.some((q) => pyIdent(q.name) === pyIdent(pg.param ?? "cursor"))) continue;
    const items = pg.itemsField ? `_at(page, ${pyStr(pg.itemsField)})` : "page";
    const call = (extra: string) => `self.${fn}(${[...s.pathParams.map(pyIdent), `**{**query, ${extra}}`].join(", ")}, fresh=True)`;
    L.push(
      `    def iterate_${fn.replace(/^(list|get)_/, "")}(self, ${[...pathArgs, "max_pages: int = 10", "**query: Any"].join(", ")}) -> Iterator[${s.typeName}]:`,
      `        """Iterates pages (${pg.style}). Bounded by max_pages; never unbounded."""`,
    );
    const param = pg.param ? pyIdent(pg.param) : "cursor";
    switch (pg.style) {
      case "page":
        L.push(
          `        start = int(query.pop(${pyStr(param)}, 1) or 1)`,
          "        for i in range(max_pages):",
          `            page = ${call(`${pyStr(param)}: start + i`)}`,
          "            yield page",
          `            items = ${items}`,
          "            if isinstance(items, list) and not items:",
          "                return",
          ...(pg.nextField ? [`            if _at(page, ${pyStr(pg.nextField)}) is None:`, "                return"] : []),
        );
        break;
      case "offset":
        L.push(
          `        offset = int(query.pop(${pyStr(param)}, 0) or 0)`,
          "        for _ in range(max_pages):",
          `            page = ${call(`${pyStr(param)}: offset`)}`,
          "            yield page",
          `            items = ${items}`,
          "            if not isinstance(items, list) or not items:",
          "                return",
          "            offset += len(items)",
        );
        break;
      case "cursor":
        L.push(
          "        for _ in range(max_pages):",
          `            page = ${call("")}`,
          "            yield page",
          `            nxt = _at(page, ${pyStr(pg.nextField ?? "next_cursor")})`,
          "            if not isinstance(nxt, str) or not nxt:",
          "                return",
          `            query[${pyStr(param)}] = nxt`,
        );
        break;
      default:
        L.push(
          `        url: Optional[str] = self._url(${pyStr(s.urlTemplate)}, {${s.pathParams.map((x) => `${pyStr(x)}: ${pyIdent(x)}`).join(", ")}}, query)`,
          "        origin = urllib.parse.urlsplit(url).netloc",
          "        for _ in range(max_pages):",
          "            if not url:",
          "                return",
          "            data, headers = self.http.get(url, fresh=True)",
          `            page = validate_${snake(s.typeName)}(data)`,
          "            yield page",
          ...(pg.style === "link-header"
            ? ["            m = re.search(r'<([^>]+)>\\s*;\\s*rel=\"?next\"?', headers.get('link', ''))", "            nxt = m.group(1) if m else None"]
            : [`            nxt = _at(page, ${pyStr(pg.nextField ?? "next")})`]),
          "            url = urllib.parse.urljoin(url, nxt) if isinstance(nxt, str) and nxt else None",
          "            if url and urllib.parse.urlsplit(url).netloc != origin:",
          "                url = None",
        );
    }
    L.push("");
  }
  for (const e of p.embedded) {
    L.push(
      `    def ${pyIdent(e.fnName)}(self, page_url: str = ${pyStr(e.pageUrl)}, *, fresh: bool = False) -> ${e.typeName}:`,
      `        """Extracts ${e.kind} (${e.selector}) from the HTML page; nothing is executed."""`,
      "        url = self._url(page_url, {}, {})",
      "        html, _ = self.http.get(url, accept='text/html', fresh=fresh)",
      `        return validate_${snake(e.typeName)}(_extract(str(html), ${pyStr(e.kind)}, ${pyStr(e.selector)}))`,
      "",
    );
  }
  if (p.embedded.length)
    L.push(
      "",
      "def _extract(html: str, kind: str, selector: str) -> Any:",
      "    if kind == 'json-ld':",
      "        blocks = re.findall(r'<script[^>]*type=[\"\\']application/ld\\+json[\"\\'][^>]*>(.*?)</script>', html, re.S | re.I)",
      "        if not blocks:",
      "            raise IntegrationError('no JSON-LD block found (page markup changed?)')",
      "        return json.loads(blocks[0])",
      "    m = re.match(r'script#([\\w-]+)$', selector)",
      "    if m:",
      "        found = re.search(r'<script[^>]*id=[\"\\']' + re.escape(m.group(1)) + r'[\"\\'][^>]*>(.*?)</script>', html, re.S | re.I)",
      "        if not found:",
      "            raise IntegrationError(f'{selector} not found (page markup changed?)')",
      "        return json.loads(found.group(1))",
      "    raise IntegrationError(f'unsupported selector {selector}')",
      "",
    );
  return `${L.join("\n")}\n`;
}

function hasIterator(s: PlanSource): boolean {
  const pg = s.pagination;
  if (!pg) return false;
  if (pg.style === "page" || pg.style === "offset" || pg.style === "cursor") return s.queryParams.some((q) => pyIdent(q.name) === pyIdent(pg.param ?? "cursor"));
  return true;
}

function pyCall(s: PlanSource, client = "client"): string {
  const args = [
    ...s.pathParams.map((x) => pyStr(s.examples[x] ?? "1")),
    ...s.queryParams.filter((q) => q.example !== undefined && q.role !== "pagination" && !/[{}]/.test(q.example)).map((q) => `${pyIdent(q.name)}=${pyStr(q.example!)}`),
  ];
  return `${client}.${pyIdent(s.fnName)}(${args.join(", ")})`;
}

function pyModelTests(p: IntegrationPlan, pkg: string, samples: Map<string, unknown>): string {
  const all = [...p.sources, ...p.embedded];
  const L = [
    "import json",
    "import pathlib",
    "import unittest",
    "",
    `from ${pkg}.errors import ValidationError`,
    `from ${pkg}.models import ${all.map((s) => `validate_${snake(s.typeName)}`).join(", ")}`,
    "",
    "FIXTURES = pathlib.Path(__file__).parent / 'fixtures'",
    "",
    "",
    "class ModelTests(unittest.TestCase):",
  ];
  let n = 0;
  for (const s of all) {
    if (!samples.has(s.fnName)) continue;
    n++;
    const v = `validate_${snake(s.typeName)}`;
    L.push(
      `    def test_${snake(s.typeName)}_accepts_recorded(self) -> None:`,
      `        ${v}(json.loads((FIXTURES / ${pyStr(`${s.fnName}.json`)}).read_text()))`,
      "",
    );
    if (s.schema && s.schema.type !== "unknown" && s.schema.type !== "null")
      L.push(
        `    def test_${snake(s.typeName)}_rejects_drift(self) -> None:`,
        "        with self.assertRaises(ValidationError):",
        `            ${v}(${s.schema.type === "array" || s.schema.type === "object" ? "'not-the-observed-shape'" : "{'unexpected': True}"})`,
        "",
      );
  }
  if (!n) L.push("    def test_no_samples(self) -> None:", "        self.skipTest('no recorded samples')", "");
  L.push("", "if __name__ == '__main__':", "    unittest.main()", "");
  return L.join("\n");
}

function pyClientTests(p: IntegrationPlan, pkg: string, samples: Map<string, unknown>): string {
  const testable = p.sources.filter((s) => samples.has(s.fnName));
  const routes = testable.map((s) => {
    const path = decodeURIComponent(new URL(s.urlTemplate.replace(/\{/g, "%7B").replace(/\}/g, "%7D")).pathname);
    const re = path.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{\w+\\?\}|\{\w+\}/g, "[^/]+");
    return `    (re.compile(r'^${re}$'), ${pyStr(s.fnName)}),`;
  });
  const first = testable[0];
  const L = [
    "\"\"\"Offline tests: a local server replays the recorded (redacted) responses.\"\"\"",
    "import http.server",
    "import pathlib",
    "import re",
    "import threading",
    "import unittest",
    "",
    `from ${pkg} import Client, HttpError`,
    "",
    "FIXTURES = pathlib.Path(__file__).parent / 'fixtures'",
    "ROUTES = [",
    ...routes,
    "]",
    "STATE = {'fail_next': 0, 'hits': 0}",
    "",
    "",
    "class Handler(http.server.BaseHTTPRequestHandler):",
    "    def do_GET(self) -> None:  # noqa: N802",
    "        STATE['hits'] += 1",
    "        if STATE['fail_next'] > 0:",
    "            STATE['fail_next'] -= 1",
    "            self.send_response(503)",
    "            self.end_headers()",
    "            return",
    "        path = self.path.split('?')[0]",
    "        for rx, name in ROUTES:",
    "            if rx.match(path):",
    "                body = (FIXTURES / f'{name}.json').read_bytes()",
    "                self.send_response(200)",
    "                self.send_header('content-type', 'application/json')",
    "                self.end_headers()",
    "                self.wfile.write(body)",
    "                return",
    "        self.send_response(404)",
    "        self.end_headers()",
    "",
    "    def log_message(self, *args: object) -> None:",
    "        pass",
    "",
    "",
    "class ClientTests(unittest.TestCase):",
    "    server: http.server.ThreadingHTTPServer",
    "    client: Client",
    "",
    "    @classmethod",
    "    def setUpClass(cls) -> None:",
    "        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)",
    "        threading.Thread(target=cls.server.serve_forever, daemon=True).start()",
    "        cls.client = Client(base_url=f'http://127.0.0.1:{cls.server.server_address[1]}', min_interval=0, timeout=3, max_retries=2)",
    "",
    "    @classmethod",
    "    def tearDownClass(cls) -> None:",
    "        cls.server.shutdown()",
    "",
  ];
  for (const s of testable) {
    L.push(`    def test_${pyIdent(s.fnName)}(self) -> None:`, `        self.assertIsNotNone(${pyCall(s, "self.client")})`, "");
    if (s.pagination && hasIterator(s))
      L.push(
        `    def test_iterate_${pyIdent(s.fnName).replace(/^(list|get)_/, "")}_is_bounded(self) -> None:`,
        `        pages = list(self.client.iterate_${pyIdent(s.fnName).replace(/^(list|get)_/, "")}(${s.pathParams.map((x) => pyStr(s.examples[x] ?? "1")).join(", ")}${s.pathParams.length ? ", " : ""}max_pages=2))`,
        "        self.assertTrue(1 <= len(pages) <= 2)",
        "",
      );
  }
  if (first)
    L.push(
      "    def test_retries_transient_503(self) -> None:",
      "        self.client.clear_cache()",
      "        STATE['fail_next'] = 1",
      `        ${pyCall(first, "self.client")}`,
      "        self.assertEqual(STATE['fail_next'], 0)",
      "",
      "    def test_gives_up_with_http_error(self) -> None:",
      "        self.client.clear_cache()",
      "        STATE['fail_next'] = 10",
      "        with self.assertRaises(HttpError):",
      `            ${pyCall(first, "self.client")}`,
      "        STATE['fail_next'] = 0",
      "",
      "    def test_cache(self) -> None:",
      "        self.client.clear_cache()",
      `        ${pyCall(first, "self.client")}`,
      "        before = STATE['hits']",
      `        ${pyCall(first, "self.client")}`,
      "        self.assertEqual(STATE['hits'], before)",
      "",
    );
  else L.push("    def test_nothing_to_replay(self) -> None:", "        self.skipTest('no recorded API samples')", "");
  L.push("", "if __name__ == '__main__':", "    unittest.main()", "");
  return L.join("\n");
}

function pyLiveTests(p: IntegrationPlan, pkg: string): string {
  const L = [
    "\"\"\"Live smoke tests (opt-in): LIVE=1 python -m unittest tests.test_live\"\"\"",
    "import os",
    "import unittest",
    "",
    `from ${pkg} import Client`,
    "",
    "",
    "@unittest.skipUnless(os.environ.get('LIVE') == '1', 'set LIVE=1')",
    "class LiveTests(unittest.TestCase):",
    "    client = Client(cache_ttl=0)",
    "",
  ];
  for (const s of p.sources) L.push(`    def test_${pyIdent(s.fnName)}(self) -> None:`, `        self.assertIsNotNone(${pyCall(s, "self.client")})`, "");
  for (const e of p.embedded) L.push(`    def test_${pyIdent(e.fnName)}(self) -> None:`, `        self.assertIsNotNone(self.client.${pyIdent(e.fnName)}())`, "");
  if (!p.sources.length && !p.embedded.length) L.push("    pass", "");
  return L.join("\n");
}

function pyExample(p: IntegrationPlan, pkg: string): string {
  const first = p.sources[0];
  const e = p.embedded[0];
  return [
    `"""Usage example: python examples/basic.py"""`,
    "import json",
    "import pathlib",
    "import sys",
    "",
    "sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))",
    "",
    `from ${pkg} import Client  # noqa: E402`,
    "",
    "client = Client(logger=lambda line: print(line, file=sys.stderr))",
    first ? `data = ${pyCall(first)}` : e ? `data = client.${pyIdent(e.fnName)}()` : "data = None",
    "print(json.dumps(data, indent=2)[:2000])",
    "",
  ].join("\n");
}

function pyReadme(p: IntegrationPlan, pkg: string): string {
  return `# ${p.name} (Python)

Generated by [rea-from-api](https://github.com/vitorcgo/rea-from-api) for: _${p.goal}_ — source ${p.sourceUrl}.
Standard library only (Python ≥ 3.11; 3.9+ with \`typing_extensions\`).

## Methods

${p.sources.map((s) => `- \`Client.${pyIdent(s.fnName)}(${[...s.pathParams.map(pyIdent), ...s.queryParams.map((q) => `${pyIdent(q.name)}=…`)].join(", ")})\` → \`${s.typeName}\` — \`GET ${s.urlTemplate}\` (${s.documented ? "documented" : "undocumented"}, ${s.status})${hasIterator(s) ? ` · \`iterate_${pyIdent(s.fnName).replace(/^(list|get)_/, "")}(max_pages=…)\`` : ""}`).join("\n")}
${p.embedded.map((e) => `- \`Client.${pyIdent(e.fnName)}(page_url=…)\` → \`${e.typeName}\` — ${e.kind} \`${e.selector}\``).join("\n")}

## Run

\`\`\`bash
python -m unittest discover -s tests -t .      # offline, recorded fixtures
LIVE=1 python -m unittest tests.test_live      # opt-in live smoke tests
python examples/basic.py
\`\`\`

Config via \`Config\`/keyword overrides or env (see \`.env.example\`). ${p.auth.required ? `Set \`${p.auth.envVar}\` to your own authorized token.` : "No credentials were needed at generation time."}

## Architecture

\`\`\`mermaid
${renderMermaid(p).trimEnd()}
\`\`\`

## Limitations

${p.risks.map((r) => `- ${r}`).join("\n")}
`;
}
