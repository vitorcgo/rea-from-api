// Hard execution limits. Every loop in the investigator is bounded by these;
// CLI flags may lower or raise them within the MAX_* ceilings.

export interface Limits {
  /** Max HTTP requests the investigator itself issues (browser traffic excluded). */
  maxRequests: number;
  /** Wall-clock budget for the whole investigation. */
  maxDurationMs: number;
  /** Per-request timeout. */
  requestTimeoutMs: number;
  /** Retries for transient failures (network error, 502/503/504). 429 is never retried blindly. */
  maxRetries: number;
  /** Minimum delay between two requests to the same host. */
  perHostDelayMs: number;
  /** Max response bytes read per request. */
  maxBodyBytes: number;
  /** Max JS bundles scanned statically. */
  maxScripts: number;
  /** Max spec/docs URLs probed. */
  maxSpecProbes: number;
  /** Max pages followed during pagination checks. */
  maxPaginationPages: number;
  /** Browser observation window (ms) after load. */
  browserSettleMs: number;
  /** Upper bound for a single REA CLI call. */
  reaTimeoutMs: number;
  /** Longest Retry-After honoured before giving up. */
  maxRetryAfterMs: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxRequests: 60,
  maxDurationMs: 5 * 60_000,
  requestTimeoutMs: 15_000,
  maxRetries: 2,
  perHostDelayMs: 300,
  maxBodyBytes: 2 * 1024 * 1024,
  maxScripts: 15,
  maxSpecProbes: 10,
  maxPaginationPages: 2,
  browserSettleMs: 2500,
  reaTimeoutMs: 120_000,
  maxRetryAfterMs: 10_000,
};

const MAX: Partial<Limits> = {
  maxRequests: 500,
  maxDurationMs: 30 * 60_000,
  maxRetries: 4,
  maxScripts: 60,
  maxPaginationPages: 10,
};

export function resolveLimits(overrides: Partial<Limits>): Limits {
  const out = { ...DEFAULT_LIMITS };
  for (const [k, v] of Object.entries(overrides) as [keyof Limits, number | undefined][]) {
    if (v === undefined || !Number.isFinite(v) || v < 0) continue;
    const ceiling = MAX[k];
    out[k] = ceiling !== undefined ? Math.min(v, ceiling) : v;
  }
  return out;
}

export const USER_AGENT =
  "rea-from-api/0.1 (+https://github.com/vitorcgo/rea-from-api; integration discovery; respects robots.txt)";
