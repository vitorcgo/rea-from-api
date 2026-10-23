// Static runtime files copied into every generated integration. They have no
// dependencies besides Node >= 22.18 (fetch, AbortSignal.timeout, type stripping).

export const ERRORS_TS = `export class IntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class HttpError extends IntegrationError {
  readonly status: number;
  readonly url: string;
  readonly retryable: boolean;
  constructor(status: number, url: string, retryable: boolean) {
    super(\`HTTP \${status} for \${url}\`);
    this.status = status;
    this.url = url;
    this.retryable = retryable;
  }
}

export class TimeoutError extends IntegrationError {}

/** The response no longer matches the shape observed during investigation (format drift). */
export class ValidationError extends IntegrationError {
  readonly path: string;
  constructor(path: string, expected: string, got: unknown) {
    super(\`Response validation failed at \${path}: expected \${expected}, got \${describe(got)}\`);
    this.path = path;
  }
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

export function fail(path: string, expected: string, got: unknown): never {
  throw new ValidationError(path, expected, got);
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
`;

export const CACHE_TS = `/** Minimal in-memory TTL cache with a size bound (oldest entries evicted first). */
export class TtlCache {
  private store = new Map<string, { expires: number; value: unknown }>();
  private readonly maxEntries: number;
  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    if (ttlMs <= 0) return;
    if (this.store.size >= this.maxEntries) this.store.delete(this.store.keys().next().value as string);
    this.store.set(key, { expires: Date.now() + ttlMs, value });
  }

  clear(): void {
    this.store.clear();
  }
}
`;

export const HTTP_TS = `import { HttpError, IntegrationError, TimeoutError } from "./errors.ts";
import type { Config } from "./config.ts";

export interface HttpResponse<T> {
  status: number;
  headers: Headers;
  data: T;
  url: string;
}

const RETRYABLE = new Set([429, 502, 503, 504]);
const SENSITIVE_QUERY = /^(token|access_token|api_?key|key|sig|signature|auth|session|password)$/i;

/** Read-only HTTP client: timeouts, bounded retries with backoff, request pacing and redacted logs. */
export class HttpClient {
  private last = 0;
  private readonly config: Config;
  constructor(config: Config) {
    this.config = config;
  }

  async get<T = unknown>(url: string, accept = "application/json"): Promise<HttpResponse<T>> {
    let attempt = 0;
    for (;;) {
      await this.pace();
      const headers: Record<string, string> = { accept, "user-agent": this.config.userAgent };
      if (this.config.token) headers.authorization = \`Bearer \${this.config.token}\`;
      let res: Response;
      try {
        res = await fetch(url, { headers, signal: AbortSignal.timeout(this.config.timeoutMs) });
      } catch (e) {
        const err = e as Error;
        const timeout = err.name === "TimeoutError" || err.name === "AbortError";
        if (attempt < this.config.maxRetries) {
          attempt++;
          this.log("retry", url, timeout ? "timeout" : err.message);
          await sleep(backoff(attempt));
          continue;
        }
        throw timeout ? new TimeoutError(\`timeout after \${this.config.timeoutMs}ms: \${redact(url)}\`) : new IntegrationError(\`network error for \${redact(url)}: \${err.message}\`);
      }
      if (!res.ok) {
        const retryable = RETRYABLE.has(res.status);
        const wait = res.status === 429 ? retryAfter(res.headers.get("retry-after")) : backoff(attempt + 1);
        if (retryable && attempt < this.config.maxRetries && wait <= this.config.maxRetryAfterMs) {
          attempt++;
          this.log("retry", url, \`HTTP \${res.status}\`);
          await res.body?.cancel();
          await sleep(wait);
          continue;
        }
        await res.body?.cancel();
        throw new HttpError(res.status, redact(url), retryable);
      }
      const text = await res.text();
      let data: unknown = text;
      if (/json/i.test(res.headers.get("content-type") ?? "") || accept.includes("json")) {
        try {
          data = JSON.parse(text);
        } catch {
          throw new IntegrationError(\`invalid JSON from \${redact(url)}\`);
        }
      }
      this.log("ok", url, String(res.status));
      return { status: res.status, headers: res.headers, data: data as T, url: res.url || url };
    }
  }

  private async pace(): Promise<void> {
    const wait = this.config.minIntervalMs - (Date.now() - this.last);
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
  }

  private log(kind: string, url: string, detail: string): void {
    this.config.logger?.(\`[\${kind}] \${redact(url)} \${detail}\`);
  }
}

export function redact(url: string): string {
  try {
    const u = new URL(url);
    u.username = "";
    u.password = "";
    for (const k of [...u.searchParams.keys()]) if (SENSITIVE_QUERY.test(k)) u.searchParams.set(k, "[REDACTED]");
    return u.toString();
  } catch {
    return url;
  }
}

function retryAfter(v: string | null): number {
  if (!v) return 1000;
  const n = Number(v);
  if (Number.isFinite(n)) return n * 1000;
  const d = Date.parse(v);
  return Number.isFinite(d) ? Math.max(0, d - Date.now()) : 1000;
}

const backoff = (attempt: number) => Math.min(8000, 250 * 2 ** (attempt - 1));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
`;

export const EMBEDDED_TS = `import { IntegrationError } from "./errors.ts";

/** Extracts JSON embedded in HTML. The page is untrusted data; nothing is executed. */
export function extractEmbedded(html: string, kind: string, selector: string, preferType?: string): unknown {
  const decode = (s: string) => JSON.parse(s.trim());
  if (kind === "json-ld") {
    const blocks = [...html.matchAll(/<script[^>]*type=["']application\\/ld\\+json["'][^>]*>([\\s\\S]*?)<\\/script>/gi)].map((m) => {
      try {
        return decode(m[1] ?? "");
      } catch {
        return undefined;
      }
    }).filter((b) => b !== undefined);
    if (!blocks.length) throw new IntegrationError("no JSON-LD block found (page markup changed?)");
    const typed = preferType ? blocks.find((b) => JSON.stringify((b as Record<string, unknown>)["@type"] ?? "").includes(preferType)) : undefined;
    return typed ?? blocks[0];
  }
  const id = /^script#([\\w-]+)$/.exec(selector)?.[1];
  if (id) {
    const m = new RegExp(\`<script[^>]*id=["']\${id}["'][^>]*>([\\\\s\\\\S]*?)<\\\\/script>\`, "i").exec(html);
    if (!m) throw new IntegrationError(\`\${selector} not found (page markup changed?)\`);
    return decode(m[1] ?? "");
  }
  const win = /^window\\.(\\w+)$/.exec(selector)?.[1];
  if (win) {
    const m = new RegExp(\`window\\\\.\${win}\\\\s*=\\\\s*(\\\\{[\\\\s\\\\S]*?\\\\})\\\\s*;?\\\\s*<\\\\/script>\`).exec(html);
    if (!m) throw new IntegrationError(\`\${selector} not found (page markup changed?)\`);
    return decode(m[1] ?? "");
  }
  const type = /^script\\[type="([^"]+)"\\]$/.exec(selector)?.[1];
  if (type) {
    const m = new RegExp(\`<script[^>]*type=["']\${type.replace(/[+.]/g, "\\\\$&")}["'][^>]*>([\\\\s\\\\S]*?)<\\\\/script>\`, "i").exec(html);
    if (!m) throw new IntegrationError(\`\${selector} not found (page markup changed?)\`);
    return decode(m[1] ?? "");
  }
  throw new IntegrationError(\`unsupported selector \${selector}\`);
}
`;
