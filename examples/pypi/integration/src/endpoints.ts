import type { HttpClient } from "./http.ts";
import type { TtlCache } from "./cache.ts";
import type { Config } from "./config.ts";
import { IntegrationError } from "./errors.ts";
import { validatePypiByProjectVersionResponse, validatePypiResponse } from "./schemas.ts";
import type { PypiByProjectVersionResponse, PypiResponse } from "./schemas.ts";

export interface Ctx {
  http: HttpClient;
  cache: TtlCache;
  config: Config;
}

export interface CallOptions {
  /** Skip the cache for this call. */
  fresh?: boolean;
}

export interface PageOptions {
  /** Hard upper bound on pages fetched (default 10). Pagination never runs unbounded. */
  maxPages?: number;
}

type Query = Record<string, string | number | undefined>;

function buildUrl(ctx: Ctx, template: string, path: Record<string, string | number>, query: Query = {}): string {
  let url = template.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = path[k];
    if (v === undefined) throw new IntegrationError(`missing path parameter ${k}`);
    return encodeURIComponent(String(v));
  });
  if (ctx.config.baseUrl) {
    const u = new URL(url);
    url = ctx.config.baseUrl.replace(/\/$/, '') + u.pathname + u.search;
  }
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
}

function sameOrigin(a: string, b: string): boolean {
  return new URL(a).origin === new URL(b).origin;
}

async function cached<T>(ctx: Ctx, key: string, opts: CallOptions | undefined, load: () => Promise<T>): Promise<T> {
  if (!opts?.fresh) {
    const hit = ctx.cache.get<T>(key);
    if (hit !== undefined) return hit;
  }
  const value = await load();
  ctx.cache.set(key, value, ctx.config.cacheTtlMs);
  return value;
}

function at(value: unknown, path: string): unknown {
  let cur = value;
  for (const k of path.split('.').filter(Boolean)) cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[k] : undefined;
  return cur;
}
void at;
void sameOrigin;

/** GET https://pypi.org/pypi/{project}/{version}/json: documented; status at generation: confirmed. */
export async function getPypiByProjectVersion(ctx: Ctx, path: { project: string | number; version: string | number }, query: Record<string, string | number> = {}, opts?: CallOptions): Promise<PypiByProjectVersionResponse> {
  const url = buildUrl(ctx, "https://pypi.org/pypi/{project}/{version}/json", path, query as Query);
  return cached(ctx, url, opts, async () => validatePypiByProjectVersionResponse((await ctx.http.get(url)).data));
}

/** GET https://pypi.org/pypi/{project}/json: documented; status at generation: confirmed. */
export async function getPypi(ctx: Ctx, path: { project: string | number }, query: Record<string, string | number> = {}, opts?: CallOptions): Promise<PypiResponse> {
  const url = buildUrl(ctx, "https://pypi.org/pypi/{project}/json", path, query as Query);
  return cached(ctx, url, opts, async () => validatePypiResponse((await ctx.http.get(url)).data));
}
