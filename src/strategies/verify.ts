import type { Strategy, InvestigationContext } from "./types.ts";
import type { EndpointRecord } from "../core/types.ts";
import { BlockedByPolicy, BudgetExceeded } from "../core/http.ts";
import { inferSchema, mergeSchemas, findItemsPath, getPath } from "../analysis/schema.ts";
import { detectPagination } from "../analysis/pagination.ts";
import { goalTokens, scoreEndpoint } from "../analysis/goal.ts";
import { redactJson, redactText, truncate } from "../core/redact.ts";

const RATE_HEADERS = /^(x-ratelimit-|ratelimit|retry-after|x-rate-limit-)/i;
// GET is not always side-effect free: never auto-replay account, auth, admin,
// checkout or destructive-looking routes. They stay "observed"/"inferred".
const SENSITIVE_PATH =
  /(^|[/_.-])(log-?out|sign-?out|log-?in|sign-?in|sign-?up|register|auth|oauth2?|sso|saml|token|password|reset|2fa|mfa|otp|webauthn|account|accounts|manage|admin|settings|profile|me|session|sessions|checkout|cart|basket|payment|payments|billing|order|orders|delete|remove|destroy|unsubscribe|subscribe|confirm|verify|activate|invite)([/_.?-]|$)/i;
const STATIC_ASSET = /\.(js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map)(\?|$)/i;

/**
 * Replays candidates with read-only GET requests to confirm or reject them,
 * then infers schema and pagination from the real response. Ordered by goal
 * relevance; bounded by the request budget. Never sends POST/PUT/PATCH/DELETE.
 */
export const verify: Strategy = {
  id: "verify",
  description: "Replay GET candidates on allowed origins (robots-aware, budgeted), infer schema/pagination, mark confirmed/unavailable",
  async run(ctx) {
    const tokens = goalTokens(ctx.input.goal);
    for (const ep of ctx.inventory.all) ep.goalRelevance = scoreEndpoint(ep, tokens);
    const queue = ctx.inventory.all
      .filter((e) => e.responseFormat !== "html" || e.status !== "confirmed")
      .sort((a, b) => b.goalRelevance - a.goalRelevance || rank(b) - rank(a))
      // Templated URLs last: their path params are filled from responses confirmed first.
      .sort((a, b) => Number(isTemplated(a)) - Number(isTemplated(b)));
    let tested = 0;
    let confirmed = 0;
    let budgetHit = false;
    for (const ep of queue) {
      const skip = skipReason(ctx, ep);
      if (skip) {
        if (ep.testStatus === "not-tested") ep.testStatus = skip;
        continue;
      }
      if (budgetHit || ctx.http.remaining() < 2) {
        ep.testStatus = "skipped-budget";
        budgetHit = true;
        continue;
      }
      try {
        tested++;
        if (await verifyOne(ctx, ep)) confirmed++;
      } catch (e) {
        if (e instanceof BudgetExceeded) {
          ep.testStatus = "skipped-budget";
          budgetHit = true;
        } else if (e instanceof BlockedByPolicy) {
          ep.testStatus = /robots/.test(e.message) ? "skipped-robots" : "failed";
          ep.notes.push(e.message);
          if (/robots/.test(e.message) && ep.status !== "observed") ep.status = "unavailable";
        } else {
          ep.testStatus = "failed";
          ep.notes.push(`verification error: ${(e as Error).message}`);
        }
      }
    }
    for (const ep of ctx.inventory.all) ep.goalRelevance = scoreEndpoint(ep, tokens);
    if (budgetHit) ctx.limitations.push("Request budget exhausted before every candidate was verified (raise --max-requests to continue).");
    return { status: budgetHit ? "partial" : "ok", detail: `${tested} replayed, ${confirmed} confirmed` };
  },
};

/**
 * Fills placeholders of a templated endpoint — path params and query values
 * like `?product={param}` — with real values taken from confirmed list
 * responses (e.g. items[0].id from GET /products). Never guesses values that
 * were not observed.
 */
function fillTemplate(ctx: InvestigationContext, ep: EndpointRecord): boolean {
  const url = new URL(ep.exampleUrl.replace(/\{/g, "%7B").replace(/\}/g, "%7D"));
  const queryHoles = [...url.searchParams.entries()].filter(([, v]) => /^\{\w*\}$/.test(v)).map(([k]) => k);
  if (!ep.pathParams.length && !queryHoles.length) return false;
  const lookup = (name: string, parentPath?: string): string | undefined => {
    const want = name.replace(/(Id|_id|Ids)$/, "").toLowerCase();
    for (const [id, sample] of ctx.samples) {
      const src = ctx.inventory.get(id);
      if (!src || src.status !== "confirmed" || src.id === ep.id) continue;
      const items = findItemsPath(sample.body)?.items;
      const first = items?.find((i) => i && typeof i === "object") as Record<string, unknown> | undefined;
      if (!first) continue;
      const sameCollection = (parentPath !== undefined && src.urlTemplate === parentPath) || (want.length > 1 && src.urlTemplate.toLowerCase().includes(`/${want}`));
      const field = name in first ? name : sameCollection ? ["id", "slug", `${want}Id`, `${want}_id`].find((f) => f in first) : undefined;
      const v = field ? first[field] : undefined;
      if (typeof v === "string" || typeof v === "number") {
        ep.notes.push(`Placeholder {${name}} filled with "${String(v).slice(0, 40)}" from ${src.id} (${field})`);
        return String(v);
      }
    }
    return undefined;
  };
  const values: Record<string, string> = {};
  for (const param of ep.pathParams) {
    const v = lookup(param, ep.urlTemplate.slice(0, ep.urlTemplate.indexOf(`{${param}}`)).replace(/\/$/, ""));
    if (v === undefined) return false;
    values[param] = v;
  }
  let out = ep.urlTemplate.replace(/\{(\w+)\}/g, (_m, k: string) => encodeURIComponent(values[k] ?? ""));
  if (queryHoles.length) {
    const q = new URL(out);
    for (const [k, v] of url.searchParams) q.searchParams.set(k, v);
    for (const k of queryHoles) {
      const v = lookup(k);
      if (v === undefined) return false;
      q.searchParams.set(k, v);
    }
    out = q.toString();
  }
  ep.exampleUrl = out;
  return true;
}

const isTemplated = (e: EndpointRecord) => /\{[^}]*\}|%7B/i.test(e.exampleUrl);
const rank = (e: EndpointRecord) => ({ observed: 3, inferred: 2, confirmed: 1, unavailable: 0 })[e.status];

function skipReason(ctx: InvestigationContext, ep: EndpointRecord): EndpointRecord["testStatus"] | undefined {
  if (ep.testStatus === "passed") return "passed";
  if (ep.method !== "GET") return "skipped-unsafe-method";
  if (SENSITIVE_PATH.test(new URL(ep.exampleUrl).pathname) && !ep.documented) return "skipped-sensitive-path";
  if (!ctx.allowedOrigins.has(ep.origin)) return "skipped-cross-origin";
  if (STATIC_ASSET.test(new URL(ep.exampleUrl).pathname)) return "skipped-template";
  if (/\{[^}]*\}|%7B/i.test(ep.exampleUrl) && !fillTemplate(ctx, ep)) return "skipped-template";
  if (ep.auth === "required" && ep.status !== "observed") return undefined; // still worth confirming the 401 once
  return undefined;
}

function robotsExempt(ctx: InvestigationContext, ep: EndpointRecord): boolean {
  const prefixes = ctx.input.robotsExempt ?? [];
  return ep.discoveredBy.includes("seeds") && prefixes.some((p) => ep.exampleUrl.startsWith(p));
}

async function verifyOne(ctx: InvestigationContext, ep: EndpointRecord): Promise<boolean> {
  const exempt = robotsExempt(ctx, ep);
  // --robots-exempt is the caller's statement that these URLs are an officially documented API.
  if (exempt) ep.documented = true;
  if (exempt) {
    const robots = await ctx.http.robots(ep.origin);
    const u = new URL(ep.exampleUrl);
    if (!robots.isAllowed(u.pathname + u.search)) {
      const msg = `robots.txt disallows ${u.pathname} for crawlers; called once because the caller declared it an officially documented API (--robots-exempt)`;
      ep.notes.push(msg);
      ctx.evidence.add({ strategy: "verify", kind: "note", source: ep.exampleUrl, summary: msg });
      if (!ctx.limitations.some((l) => l.includes("--robots-exempt")))
        ctx.limitations.push("Some documented endpoints are disallowed by robots.txt for crawlers and were verified only because --robots-exempt was given. Check the provider's API terms; keep request volume low and cache aggressively.");
    }
  }
  const r = await ctx.http.request(ep.exampleUrl, { accept: "application/json, */*;q=0.5", respectRobots: !exempt });
  const now = new Date().toISOString();
  const rate: Record<string, string> = {};
  for (const [k, v] of r.headers) if (RATE_HEADERS.test(k)) rate[k] = v;
  if (Object.keys(rate).length) ep.rateLimit = rate;
  const ev = ctx.evidence.add({
    strategy: "verify",
    kind: "verification",
    source: ep.exampleUrl,
    summary: `GET ${ep.exampleUrl} → ${r.status} ${r.contentType}`,
    sha256: r.sha256,
    status: r.status,
    contentType: r.contentType,
    excerpt: truncate(redactText(r.text), 300),
  });
  ep.evidenceIds.push(ev.id);
  if (!ep.discoveredBy.includes("verify")) ep.discoveredBy.push("verify");
  ep.verifiedAt = now;
  if (r.challenge) {
    ep.status = "unavailable";
    ep.testStatus = "failed";
    ep.notes.push(`Stopped: ${r.challenge}. Not bypassed by design.`);
    return false;
  }
  if (r.status >= 400) {
    ep.errorsObserved.push({ status: r.status, at: now });
    if (r.status === 401 || r.status === 403) {
      const withCred = ctx.http.credentialApplies(ep.exampleUrl);
      ep.auth = "required";
      ep.authEvidence = withCred ? `HTTP ${r.status} even with the provided credential` : `HTTP ${r.status} on unauthenticated GET`;
      ep.notes.push(
        withCred
          ? "Rejected the provided credential (wrong scope, header or key?). Check the provider's docs for --auth-header/--auth-query."
          : "Requires authorization. Re-run with your own key: --auth-env VAR (plus --auth-header/--auth-query if the API documents them). Nothing is inferred or extracted.",
      );
    }
    if (r.status === 429) ep.notes.push("Rate limited during verification.");
    ep.status = ep.status === "observed" && r.status === 429 ? "observed" : "unavailable";
    ep.testStatus = "failed";
    return false;
  }
  const finalPath = new URL(r.finalUrl).pathname;
  if (r.finalUrl !== ep.exampleUrl && /(log-?in|sign-?in|auth|sso)/i.test(finalPath) && !/(log-?in|sign-?in|auth|sso)/i.test(new URL(ep.exampleUrl).pathname)) {
    ep.auth = "required";
    ep.authEvidence = `redirected to ${finalPath}`;
    ep.status = "unavailable";
    ep.testStatus = "failed";
    ep.notes.push("Redirected to a login page: requires an authenticated session. Not pursued.");
    return false;
  }
  ep.contentType = r.contentType;
  if (ctx.http.credentialApplies(ep.exampleUrl)) {
    ep.auth = "credential";
    ep.authEvidence = "succeeded with the user's credential (whether it is strictly required was not tested)";
  } else if (ep.auth === "unknown") ep.auth = "none";
  if (/json/i.test(r.contentType) || /^\s*[{[]/.test(r.text)) {
    let data: unknown;
    try {
      data = JSON.parse(r.text);
    } catch {
      ep.status = "unavailable";
      ep.testStatus = "failed";
      ep.notes.push(r.truncated ? "Response exceeded --max-body-bytes; JSON truncated" : "Declared JSON but did not parse");
      return false;
    }
    ep.responseFormat = "json";
    const fresh = inferSchema(data);
    ep.schema = ep.schema ? mergeSchemas(ep.schema, fresh) : fresh;
    ctx.samples.set(ep.id, { body: redactJson(data), linkHeader: r.headers.get("link") });
    ep.pagination = detectPagination(ep, data, r.headers.get("link"));
    if (ep.pagination) await checkSecondPage(ctx, ep, data, r.headers.get("link"));
  } else if (/html/i.test(r.contentType)) {
    ep.responseFormat = "html";
  } else if (/xml/i.test(r.contentType)) {
    ep.responseFormat = "xml";
  } else ep.responseFormat = r.text ? "text" : "binary";
  ep.status = "confirmed";
  ep.notes = ep.notes.filter((n) => !/not yet observed|needs verification|response format unknown until verified/.test(n));
  ep.confidence = ep.responseFormat === "json" ? "high" : "medium";
  ep.testStatus = "passed";
  return true;
}

/** Fetches at most limits.maxPaginationPages-1 extra pages to prove pagination works. */
async function checkSecondPage(ctx: InvestigationContext, ep: EndpointRecord, first: unknown, link: string | null): Promise<void> {
  const p = ep.pagination!;
  if (ctx.limits.maxPaginationPages < 2) return;
  let next: string | undefined;
  const base = new URL(ep.exampleUrl);
  if (p.style === "link-header" && link) next = /<([^>]+)>\s*;\s*rel="?next"?/.exec(link)?.[1];
  else if (p.style === "next-url" && p.nextField) {
    const v = getPath(first, p.nextField);
    if (typeof v === "string") next = new URL(v, base).toString();
  } else if (p.style === "page" && p.param) {
    const cur = Number(base.searchParams.get(p.param) ?? "1");
    base.searchParams.set(p.param, String((Number.isFinite(cur) ? cur : 1) + 1));
    next = base.toString();
  } else if (p.style === "offset" && p.param) {
    const size = findItemsPath(first)?.items.length ?? 0;
    if (!size) return;
    base.searchParams.set(p.param, String(Number(base.searchParams.get(p.param) ?? "0") + size));
    next = base.toString();
  } else if (p.style === "cursor" && p.nextField) {
    const v = getPath(first, p.nextField);
    if (typeof v !== "string" || !v) return;
    base.searchParams.set(p.param ?? "cursor", v);
    next = base.toString();
  }
  if (!next || new URL(next).origin !== ep.origin) return;
  try {
    const r = await ctx.http.request(next, { accept: "application/json" });
    const ok = r.ok && /json/i.test(r.contentType);
    ctx.evidence.add({
      strategy: "verify",
      kind: "verification",
      source: next,
      summary: `Pagination check (${p.style}) → ${r.status}`,
      sha256: r.sha256,
      status: r.status,
    });
    let differs = false;
    if (ok) {
      try {
        differs = r.text !== JSON.stringify(first) && JSON.stringify(JSON.parse(r.text)) !== JSON.stringify(first);
      } catch {
        differs = false;
      }
    }
    p.basis += ok ? (differs ? "; second page fetched and differs (verified)" : "; second page identical to first (pagination unproven)") : `; second page returned ${r.status}`;
  } catch (e) {
    if (e instanceof BudgetExceeded) throw e;
    p.basis += `; second page not checked (${(e as Error).message})`;
  }
}
