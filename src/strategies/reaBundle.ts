import type { Strategy } from "./types.ts";
import { analyzeWebBundle, findChromium, reaAvailability, ReaError } from "../rea/reaCli.ts";

/**
 * Runs REA's `analyze-web-bundle` against the live page (via a short-lived,
 * isolated Chromium with a CDP port) to get REA's AST-based route/endpoint
 * candidates. Findings are recorded as *inferred*.
 */
export const reaBundle: Strategy = {
  id: "rea-bundle",
  description: "Static AST analysis of the page's JS bundle through REA analyze-web-bundle (CDP) → inferred endpoint/route candidates",
  async skip(ctx) {
    if (ctx.input.browser === "off") return "browser strategies disabled (--browser off)";
    const rea = await reaAvailability();
    if (!rea.available) return rea.reason;
    if (!findChromium()) return "no Chromium executable found";
    if (!ctx.page) return "target is not an HTML page";
    return undefined;
  },
  async run(ctx) {
    let ev: Awaited<ReturnType<typeof analyzeWebBundle>>;
    try {
      ev = await analyzeWebBundle(ctx.input.url, findChromium()!, ctx.limits.reaTimeoutMs);
    } catch (e) {
      if (e instanceof ReaError && e.reason === "target_not_allowed") {
        // Observed with REA 6.7.0 on Windows / newer Chromium builds; js-static still analyses the bundles.
        ctx.limitations.push("REA analyze-web-bundle refused the page (target_not_allowed) on this platform/browser; bundle analysis relied on js-static (source maps + scanner/jsluice).");
        return { status: "unavailable", detail: "REA analyze-web-bundle: target_not_allowed on this platform/browser (js-static covers bundles)" };
      }
      throw e;
    }
    const n = ev.normalized_result;
    const reaEv = ctx.evidence.add({
      strategy: this.id,
      kind: "rea-evidence",
      source: ctx.input.url,
      summary: `REA analyze_web_bundle: ${n.capture.scripts_analyzed}/${n.capture.scripts_observed} scripts analysed, ${n.inferences.length} inferences, ${n.observations.endpoints.length} endpoint observations`,
      reaEvidenceId: ev.evidence_id,
    });
    let added = 0;
    const values = [
      ...n.observations.endpoints.map((e) => ({ value: e.url ?? e.value ?? "", method: e.method, detector: "observation" })),
      ...n.inferences.filter((i) => i.kind === "endpoint_candidate").map((i) => ({ value: i.value, method: undefined, detector: i.basis[0]?.detector ?? "inference" })),
    ];
    for (const v of values) {
      if (!v.value || !/^(\/|https?:\/\/)/.test(v.value)) continue;
      let abs: string;
      try {
        abs = new URL(v.value, ctx.input.url).toString();
      } catch {
        continue;
      }
      const detEv = ctx.evidence.add({
        strategy: this.id,
        kind: "static-js",
        source: ctx.input.url,
        summary: `REA endpoint candidate "${v.value}" (detector ${v.detector})`,
        reaEvidenceId: ev.evidence_id,
      });
      const rec = ctx.inventory.add({
        method: v.method ?? "GET",
        url: abs,
        strategy: this.id,
        evidenceId: detEv.id,
        status: "inferred",
        note: "REA static bundle candidate; does not prove the call executes",
      });
      if (!rec.evidenceIds.includes(reaEv.id)) rec.evidenceIds.push(reaEv.id);
      added++;
    }
    return { status: "ok", detail: `${added} candidates from REA (evidence ${ev.evidence_id})` };
  },
};
