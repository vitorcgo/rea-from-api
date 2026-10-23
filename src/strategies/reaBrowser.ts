import type { Strategy } from "./types.ts";
import { captureBrowserScenario, findChromium, reaAvailability, type ReaNetworkEvent } from "../rea/reaCli.ts";
import { inferSchema } from "../analysis/schema.ts";
import { redactJson, redactText, truncate } from "../core/redact.ts";

const DATA_RESOURCE_TYPES = new Set(["fetch", "xhr", "eventsource", "websocket"]);
const NOISE = /google-analytics|googletagmanager|doubleclick|facebook\.com\/tr|hotjar|segment\.io|sentry\.io|plausible\.io|clarity\.ms|newrelic|datadoghq|\/collect\b|\/beacon\b|\/telemetry\b/i;

/**
 * Runs REA's `capture-browser-scenario` (Playwright, provider-owned profile) to
 * observe the real network traffic after the page renders, including response
 * bodies. Every observed fetch/XHR becomes an *observed* endpoint.
 */
export const reaBrowser: Strategy = {
  id: "rea-browser",
  description: "Render the page in Chromium through REA capture-browser-scenario and record fetch/XHR traffic with response bodies",
  async skip(ctx) {
    if (ctx.input.browser === "off") return "browser strategies disabled (--browser off)";
    const rea = await reaAvailability();
    if (!rea.available) return rea.reason;
    if (!findChromium()) return "no Chromium executable found (set REA_FROM_API_CHROMIUM or install Playwright Chromium)";
    return undefined;
  },
  async run(ctx) {
    const chromium = findChromium()!;
    ctx.log.event("rea-browser-start", { url: ctx.input.url });
    const ev = await captureBrowserScenario({
      url: ctx.input.url,
      settleMs: ctx.limits.browserSettleMs,
      executable: chromium,
      scrollToBottom: true,
      timeoutMs: ctx.limits.reaTimeoutMs,
    });
    const items = ev.normalized_result.events.items;
    const responses = new Map<string, ReaNetworkEvent>();
    const requests = new Map<string, ReaNetworkEvent>();
    const bodies = new Map<string, NonNullable<ReaNetworkEvent["body"]>>();
    const failures: ReaNetworkEvent[] = [];
    for (const e of items) {
      if (!e.transaction_id) continue;
      if (e.kind === "request") requests.set(e.transaction_id, e);
      else if (e.kind === "response") responses.set(e.transaction_id, e);
      else if (e.kind === "request-failed") failures.push(e);
      else if (e.kind === "network-content" && e.phase === "response" && e.body?.state === "captured") bodies.set(e.transaction_id, e.body);
    }
    const reaEv = ctx.evidence.add({
      strategy: this.id,
      kind: "rea-evidence",
      source: ctx.input.url,
      summary: `REA capture_browser_scenario: ${requests.size} requests, ${responses.size} responses, ${bodies.size} bodies, ${ev.normalized_result.events.dropped} dropped events`,
      reaEvidenceId: ev.evidence_id,
    });
    for (const l of ev.limitations ?? []) if (/body|not_exposed|Playwright/.test(l) && !ctx.limitations.includes(`REA: ${l}`)) ctx.limitations.push(`REA: ${l}`);

    let dataCalls = 0;
    for (const [tid, req] of requests) {
      const res = responses.get(tid);
      const url = req.url?.url;
      if (!url || !/^https?:/.test(url) || NOISE.test(url)) continue;
      const body = bodies.get(tid);
      const media = body?.media_type ?? "";
      const isData = DATA_RESOURCE_TYPES.has(req.resource_type ?? "") || /json/i.test(media);
      if (!isData) continue;
      dataCalls++;
      const text = body?.content && body.encoding === "base64" ? Buffer.from(body.content, "base64").toString("utf8") : "";
      let json: unknown;
      if (/json/i.test(media) || /^\s*[{[]/.test(text)) {
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
      }
      const tev = ctx.evidence.add({
        strategy: this.id,
        kind: "browser-capture",
        source: url,
        summary: `${req.method} ${url} → ${res?.status ?? "no response"} (${req.resource_type}, ${media || "no body"})`,
        sha256: body?.sha256,
        status: res?.status ?? undefined,
        contentType: media || undefined,
        excerpt: text ? truncate(redactText(text), 300) : undefined,
        reaEvidenceId: ev.evidence_id,
      });
      const sameOrTrusted = ctx.allowedOrigins.has(new URL(url).origin);
      const rec = ctx.inventory.add({
        method: req.method ?? "GET",
        url,
        strategy: this.id,
        evidenceId: tev.id,
        status: res?.status && res.status < 400 ? "observed" : "unavailable",
        responseFormat: json !== undefined ? "json" : media.includes("html") ? "html" : media ? "text" : "unknown",
        contentType: media || undefined,
        httpStatus: res?.status ?? undefined,
        requiredHeaders: (req.header_names ?? []).filter((h) => /^(x-|authorization$|accept$)/i.test(h) && !/^x-(requested-with|client-data)$/i.test(h)),
        bodyFormat: req.method !== "GET" ? "observed (see REA evidence)" : undefined,
        note: sameOrTrusted ? `Seen in browser traffic (REA ${ev.evidence_id})` : "Third-party request seen in browser traffic",
      });
      if (!rec.evidenceIds.includes(reaEv.id)) rec.evidenceIds.push(reaEv.id);
      if (json !== undefined && res?.status && res.status < 400) {
        rec.schema = inferSchema(json);
        if (!ctx.samples.has(rec.id)) ctx.samples.set(rec.id, { body: redactJson(json) });
      }
    }
    for (const f of failures) {
      if (f.url?.url && !NOISE.test(f.url.url))
        ctx.log.event("browser-request-failed", { url: f.url.url, failure: JSON.stringify(f.failure).slice(0, 200) });
    }
    const status = ev.normalized_result.completeness?.status === "complete" ? "ok" : "partial";
    return { status, detail: `${dataCalls} data requests (fetch/XHR/JSON) observed; REA evidence ${ev.evidence_id}` };
  },
};
