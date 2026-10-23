import type { Strategy } from "./types.ts";
import { inspectHar, reaAvailability } from "../rea/reaCli.ts";
import { inferSchema } from "../analysis/schema.ts";
import { redactJson } from "../core/redact.ts";

interface HarRecord {
  ordinal: number;
  reported: {
    request?: { method?: string; url?: string; headers?: { name: string }[] };
    response?: { status?: number; content?: { mimeType?: string; text?: string | null; encoding?: string } };
  };
}

/**
 * Imports a user-recorded HAR (e.g. from browser DevTools while logged in to
 * *their own* account) through REA's offline `inspect-web-network-capture`.
 * REA redacts transport credentials; we additionally keep header names only.
 */
export const har: Strategy = {
  id: "har",
  description: "Import a user-supplied HAR through REA inspect-web-network-capture (offline; credentials redacted by REA)",
  async skip(ctx) {
    if (!ctx.input.harPath) return "no --har file supplied";
    const rea = await reaAvailability();
    return rea.available ? undefined : rea.reason;
  },
  async run(ctx) {
    const ev = await inspectHar(ctx.input.harPath!, ctx.limits.reaTimeoutMs);
    const records = ((ev.normalized_result as { records?: HarRecord[] }).records ?? []) as HarRecord[];
    const reaEv = ctx.evidence.add({
      strategy: this.id,
      kind: "har",
      source: ctx.input.harPath!,
      summary: `REA inspect_web_network_capture: ${records.length} HAR records`,
      reaEvidenceId: ev.evidence_id,
    });
    let n = 0;
    for (const r of records) {
      const req = r.reported.request;
      const res = r.reported.response;
      if (!req?.url || !/^https?:/.test(req.url)) continue;
      const mime = res?.content?.mimeType ?? "";
      if (!/json|xml|graphql/i.test(mime) && !/\/(api|graphql|v\d+)\//i.test(req.url)) continue;
      let json: unknown;
      if (res?.content?.text && /json/i.test(mime)) {
        try {
          const raw = res.content.encoding === "base64" ? Buffer.from(res.content.text, "base64").toString("utf8") : res.content.text;
          json = JSON.parse(raw);
        } catch {
          json = undefined;
        }
      }
      const headerNames = (req.headers ?? []).map((h) => h.name.toLowerCase());
      const rec = ctx.inventory.add({
        method: req.method ?? "GET",
        url: req.url,
        strategy: this.id,
        evidenceId: reaEv.id,
        status: res?.status && res.status < 400 ? "observed" : "unavailable",
        responseFormat: json !== undefined ? "json" : mime.includes("xml") ? "xml" : "unknown",
        contentType: mime || undefined,
        httpStatus: res?.status,
        requiredHeaders: headerNames.filter((h) => /^(authorization|x-api-key|x-.*token)$/.test(h)),
        note: `HAR record #${r.ordinal}${headerNames.includes("authorization") || headerNames.includes("cookie") ? " (request was authenticated in the recording)" : ""}`,
      });
      if (headerNames.includes("authorization") || headerNames.includes("cookie")) {
        rec.auth = "required";
        rec.authEvidence = "credentials present in recorded request (values redacted)";
      }
      if (json !== undefined) {
        rec.schema = inferSchema(json);
        if (!ctx.samples.has(rec.id)) ctx.samples.set(rec.id, { body: redactJson(json) });
      }
      n++;
    }
    return { status: "ok", detail: `${n} data records imported from HAR` };
  },
};
