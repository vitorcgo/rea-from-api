import { HttpError, IntegrationError, TimeoutError } from "./errors.ts";
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
      if (this.config.token) headers.authorization = `Bearer ${this.config.token}`;
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
        throw timeout ? new TimeoutError(`timeout after ${this.config.timeoutMs}ms: ${redact(url)}`) : new IntegrationError(`network error for ${redact(url)}: ${err.message}`);
      }
      if (!res.ok) {
        const retryable = RETRYABLE.has(res.status);
        const wait = res.status === 429 ? retryAfter(res.headers.get("retry-after")) : backoff(attempt + 1);
        if (retryable && attempt < this.config.maxRetries && wait <= this.config.maxRetryAfterMs) {
          attempt++;
          this.log("retry", url, `HTTP ${res.status}`);
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
          throw new IntegrationError(`invalid JSON from ${redact(url)}`);
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
    this.config.logger?.(`[${kind}] ${redact(url)} ${detail}`);
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
