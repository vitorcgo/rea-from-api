// The only path through which the investigator itself issues HTTP requests.
// It enforces: request budget, wall-clock budget, per-host pacing, timeouts,
// bounded retries, robots.txt for replays, read-only methods, body size caps,
// and challenge/CAPTCHA detection (which stops, never bypasses).

import { createHash } from "node:crypto";
import type { Limits } from "./limits.ts";
import { USER_AGENT } from "./limits.ts";
import { parseRobots, ALLOW_ALL, type RobotsPolicy } from "./robots.ts";
import { redactUrl } from "./redact.ts";
import type { ProgressLog } from "./progress.ts";
import type { AuthSpec } from "./types.ts";
import { registerSecret } from "./redact.ts";

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  headers: Headers;
  contentType: string;
  body: Buffer;
  text: string;
  sha256: string;
  truncated: boolean;
  elapsedMs: number;
  challenge?: string;
}

export class BudgetExceeded extends Error {
  constructor(what: string) {
    super(`budget exceeded: ${what}`);
    this.name = "BudgetExceeded";
  }
}

export class BlockedByPolicy extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "BlockedByPolicy";
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD"]);
const RETRYABLE = new Set([502, 503, 504]);

/**
 * The only request body the investigator may ever send: the standard, read-only
 * GraphQL introspection query (trimmed to what the report uses).
 */
export const GRAPHQL_INTROSPECTION_QUERY =
  "query IntrospectionQuery { __schema { queryType { name } mutationType { name } subscriptionType { name } types { kind name description fields(includeDeprecated: false) { name description args { name type { kind name ofType { kind name ofType { kind name } } } } type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } }";

export interface SafeFetchOptions {
  method?: "GET" | "HEAD" | "POST";
  /** Only GRAPHQL_INTROSPECTION_QUERY is accepted as a POST body. */
  graphqlIntrospection?: boolean;
  /** Overrides the per-request timeout (slow third-party indexes such as the Wayback CDX API). */
  timeoutMs?: number;
  accept?: string;
  /** Enforce robots.txt (default true). Discovery of robots.txt itself bypasses it. */
  respectRobots?: boolean;
  /** Extra non-secret headers (e.g. Accept). Authorization is injected only from env by the caller. */
  headers?: Record<string, string>;
}

export class SafeHttp {
  requestsUsed = 0;
  readonly startedAt = Date.now();
  private lastByHost = new Map<string, number>();
  private robotsByOrigin = new Map<string, Promise<RobotsPolicy>>();
  /** Hosts that answered with a challenge or exhausted Retry-After: no more requests. */
  readonly stoppedHosts = new Map<string, string>();

  readonly limits: Limits;
  private log?: ProgressLog;
  private auth?: { spec: AuthSpec; value: string; origins: Set<string> };

  constructor(limits: Limits, log?: ProgressLog) {
    this.limits = limits;
    this.log = log;
  }

  /**
   * Uses the user's own credential (read from an env var) for requests to
   * `origins` only, never for third-party indexes. The value is registered for
   * redaction so it cannot reach logs, evidence or samples.
   */
  useCredential(spec: AuthSpec, origins: Set<string>): void {
    const value = process.env[spec.envVar];
    if (!value) throw new Error(`--auth-env ${spec.envVar}: environment variable is not set`);
    registerSecret(value);
    this.auth = { spec, value, origins };
  }

  /** True when a request to this URL carries the user's credential. */
  credentialApplies(url: string): boolean {
    return !!this.auth && this.auth.origins.has(new URL(url).origin);
  }

  elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  remaining(): number {
    return this.limits.maxRequests - this.requestsUsed;
  }

  checkTime(): void {
    if (this.elapsedMs() > this.limits.maxDurationMs) throw new BudgetExceeded("maxDurationMs");
  }

  async robots(origin: string): Promise<RobotsPolicy> {
    let p = this.robotsByOrigin.get(origin);
    if (!p) {
      p = (async () => {
        try {
          const r = await this.request(`${origin}/robots.txt`, { respectRobots: false, accept: "text/plain" });
          if (r.status === 200 && !/html/i.test(r.contentType)) return parseRobots(r.text);
        } catch (e) {
          if (e instanceof BudgetExceeded) throw e;
        }
        return ALLOW_ALL;
      })();
      this.robotsByOrigin.set(origin, p);
    }
    return p;
  }

  async request(url: string, opts: SafeFetchOptions = {}): Promise<FetchResult> {
    const method = opts.method ?? "GET";
    const introspection = method === "POST" && opts.graphqlIntrospection === true;
    if (!SAFE_METHODS.has(method) && !introspection) throw new BlockedByPolicy(`method ${method} is not allowed for automatic requests`);
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new BlockedByPolicy(`unsupported protocol ${u.protocol}`);
    if (u.username || u.password) throw new BlockedByPolicy("URLs with embedded credentials are rejected");
    const stopped = this.stoppedHosts.get(u.host);
    if (stopped) throw new BlockedByPolicy(`host ${u.host} stopped: ${stopped}`);
    if (opts.respectRobots !== false) {
      const robots = await this.robots(u.origin);
      if (!robots.isAllowed(u.pathname + u.search)) throw new BlockedByPolicy(`robots.txt disallows ${u.pathname}`);
    }

    const authHeaders: Record<string, string> = {};
    if (this.auth && this.auth.origins.has(u.origin) && opts.respectRobots !== false) {
      const { spec, value } = this.auth;
      if (spec.query) u.searchParams.set(spec.query, value);
      else {
        const header = spec.header ?? "Authorization";
        authHeaders[header] = `${spec.scheme ?? (header.toLowerCase() === "authorization" ? "Bearer " : "")}${value}`;
      }
    }

    let attempt = 0;
    for (;;) {
      this.checkTime();
      if (this.requestsUsed >= this.limits.maxRequests) throw new BudgetExceeded("maxRequests");
      await this.pace(u.host);
      this.requestsUsed++;
      const started = Date.now();
      try {
        const res = await fetch(u, {
          method,
          redirect: "follow",
          signal: AbortSignal.timeout(opts.timeoutMs ?? this.limits.requestTimeoutMs),
          headers: {
            "user-agent": USER_AGENT,
            accept: opts.accept ?? "*/*",
            ...(introspection ? { "content-type": "application/json" } : {}),
            ...opts.headers,
            ...authHeaders,
          },
          ...(introspection ? { body: JSON.stringify({ query: GRAPHQL_INTROSPECTION_QUERY, operationName: "IntrospectionQuery" }) } : {}),
        });
        const { body, truncated } = await readCapped(res, this.limits.maxBodyBytes);
        const contentType = res.headers.get("content-type") ?? "";
        const text = isTextual(contentType) ? body.toString("utf8") : "";
        const result: FetchResult = {
          url,
          finalUrl: res.url || url,
          status: res.status,
          ok: res.ok,
          headers: res.headers,
          contentType,
          body,
          text,
          sha256: createHash("sha256").update(body).digest("hex"),
          truncated,
          elapsedMs: Date.now() - started,
          challenge: detectChallenge(res.status, res.headers, text),
        };
        this.log?.event("http", { method, url: redactUrl(url), status: res.status, ms: result.elapsedMs });
        if (result.challenge) {
          this.stoppedHosts.set(u.host, result.challenge);
          return result;
        }
        if (res.status === 429) {
          const wait = retryAfterMs(res.headers.get("retry-after"));
          if (attempt < this.limits.maxRetries && wait !== undefined && wait <= this.limits.maxRetryAfterMs) {
            attempt++;
            await sleep(wait);
            continue;
          }
          this.stoppedHosts.set(u.host, "rate limited (429)");
          return result;
        }
        if (RETRYABLE.has(res.status) && attempt < this.limits.maxRetries) {
          attempt++;
          await sleep(backoff(attempt));
          continue;
        }
        return result;
      } catch (e) {
        if (e instanceof BudgetExceeded || e instanceof BlockedByPolicy) throw e;
        this.log?.event("http-error", { method, url: redactUrl(url), error: String((e as Error).message) });
        if (attempt < this.limits.maxRetries) {
          attempt++;
          await sleep(backoff(attempt));
          continue;
        }
        throw e;
      }
    }
  }

  private async pace(host: string): Promise<void> {
    const last = this.lastByHost.get(host);
    const wait = last === undefined ? 0 : this.limits.perHostDelayMs - (Date.now() - last);
    if (wait > 0) await sleep(wait);
    this.lastByHost.set(host, Date.now());
  }
}

async function readCapped(res: Response, max: number): Promise<{ body: Buffer; truncated: boolean }> {
  if (!res.body) return { body: Buffer.alloc(0), truncated: false };
  const chunks: Buffer[] = [];
  let size = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      chunks.push(Buffer.from(value.subarray(0, value.byteLength - (size - max))));
      await reader.cancel();
      return { body: Buffer.concat(chunks), truncated: true };
    }
    chunks.push(Buffer.from(value));
  }
  return { body: Buffer.concat(chunks), truncated: false };
}

export function isTextual(contentType: string): boolean {
  return contentType === "" || /json|text|xml|javascript|html|ecmascript|csv|yaml/i.test(contentType);
}

/** Detects bot challenges / CAPTCHAs. The investigator stops on these; it never attempts to solve them. */
export function detectChallenge(status: number, headers: Headers, text: string): string | undefined {
  if (headers.get("cf-mitigated") === "challenge") return "Cloudflare challenge";
  const sample = text.slice(0, 20_000);
  if ((status === 403 || status === 503 || status === 429) && /cf-chl|challenge-platform|Just a moment\.\.\./i.test(sample))
    return "Cloudflare challenge";
  if (/g-recaptcha|hcaptcha\.com|recaptcha\/api\.js|turnstile\/v0/i.test(sample) && /captcha/i.test(sample) && status >= 400)
    return "CAPTCHA";
  if (/_Incapsula_Resource|perimeterx|px-captcha|datadome/i.test(sample) && status >= 400) return "anti-bot protection";
  return undefined;
}

function retryAfterMs(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  if (Number.isFinite(n)) return n * 1000;
  const d = Date.parse(v);
  return Number.isFinite(d) ? Math.max(0, d - Date.now()) : undefined;
}

const backoff = (attempt: number) => Math.min(4000, 400 * 2 ** (attempt - 1));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
