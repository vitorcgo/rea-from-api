import type { Strategy } from "./types.ts";
import { analyzeHtml, classifyAppType } from "../analysis/html.ts";
import { inferSchema } from "../analysis/schema.ts";
import { redactJson, redactText, truncate } from "../core/redact.ts";

/** Fetches the target URL once and analyses HTML, metadata and embedded JSON. */
export const htmlStatic: Strategy = {
  id: "html-static",
  description: "Fetch the page, fingerprint technology, extract embedded JSON (JSON-LD, __NEXT_DATA__, inline state), links and forms",
  async run(ctx) {
    const url = ctx.input.url;
    const r = await ctx.http.request(url, { accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8" });
    const ev = ctx.evidence.add({
      strategy: this.id,
      kind: "http-response",
      source: url,
      summary: `GET ${url} → ${r.status} ${r.contentType}${r.truncated ? " (truncated)" : ""}`,
      sha256: r.sha256,
      status: r.status,
      contentType: r.contentType,
      excerpt: truncate(redactText(r.text), 400),
    });
    if (r.challenge) {
      ctx.limitations.push(`Target answered with ${r.challenge}; rea-from-api does not bypass bot protection. Use an official API or ask the site owner for access.`);
      return { status: "failed", detail: `stopped: ${r.challenge}` };
    }
    if (/json/i.test(r.contentType)) {
      // The URL itself is a JSON resource.
      let data: unknown;
      try {
        data = JSON.parse(r.text);
      } catch {
        data = undefined;
      }
      const ep = ctx.inventory.add({
        method: "GET",
        url,
        strategy: this.id,
        evidenceId: ev.id,
        status: r.ok ? "confirmed" : "unavailable",
        responseFormat: "json",
        contentType: r.contentType,
        httpStatus: r.status,
      });
      if (r.ok && data !== undefined) {
        ep.schema = inferSchema(data);
        ep.testStatus = "passed";
        ep.verifiedAt = new Date().toISOString();
        ctx.samples.set(ep.id, { body: redactJson(data), linkHeader: r.headers.get("link") });
      }
      ctx.appType = "JSON API endpoint";
      return { status: "ok", detail: "target URL is a JSON resource" };
    }
    const analysis = analyzeHtml(r.text, r.finalUrl, r.headers);
    ctx.page = { url: r.finalUrl, status: r.status, html: r.text, analysis, headers: r.headers };
    ctx.tech.push(...analysis.tech);
    ctx.appType = classifyAppType(analysis, r.text);

    const page = ctx.inventory.add({
      method: "GET",
      url: r.finalUrl,
      strategy: this.id,
      evidenceId: ev.id,
      status: r.ok ? "confirmed" : "unavailable",
      responseFormat: "html",
      contentType: r.contentType,
      httpStatus: r.status,
      purpose: `Public HTML page${analysis.title ? ` "${analysis.title}"` : ""}`,
    });
    if (r.ok) {
      page.testStatus = "passed";
      page.verifiedAt = new Date().toISOString();
      page.auth = "none";
    }

    for (const [i, block] of analysis.embedded.entries()) {
      const bev = ctx.evidence.add({
        strategy: this.id,
        kind: "html-analysis",
        source: r.finalUrl,
        summary: `Embedded ${block.kind} block at ${block.selector}${block.data === undefined ? " (not valid JSON)" : ""}`,
        excerpt: truncate(redactText(block.raw), 300),
      });
      const types = jsonLdTypes(block.data);
      const sampleFile = block.data !== undefined ? ctx.saveSample(`embedded-${i}-${block.kind}`, redactJson(block.data)) : undefined;
      ctx.embedded.push({
        kind: block.kind,
        selector: block.selector,
        pageUrl: r.finalUrl,
        evidenceId: bev.id,
        schema: block.data !== undefined ? inferSchema(block.data) : undefined,
        types: types.length ? types : undefined,
        sampleFile,
      });
    }

    for (const f of analysis.forms) {
      if (f.method !== "GET" || !f.inputs.length) continue;
      const u = new URL(f.action);
      for (const n of f.inputs) u.searchParams.set(n, "");
      const fev = ctx.evidence.add({
        strategy: this.id,
        kind: "html-analysis",
        source: r.finalUrl,
        summary: `GET form → ${f.action} with inputs [${f.inputs.join(", ")}]`,
      });
      ctx.inventory.add({
        method: "GET",
        url: u.toString(),
        strategy: this.id,
        evidenceId: fev.id,
        status: "inferred",
        purpose: `HTML search/filter form (${f.inputs.join(", ")})`,
        note: "Derived from a GET <form>; response format unknown until verified",
      });
    }

    const detail = [
      `${analysis.scripts.length} scripts`,
      `${analysis.embedded.length} embedded data blocks`,
      `${analysis.docLinks.length} doc/API links`,
      `${analysis.forms.length} forms`,
    ].join(", ");
    return { status: r.ok ? "ok" : "partial", detail: `HTTP ${r.status}; ${detail}` };
  },
};

function jsonLdTypes(data: unknown): string[] {
  const out = new Set<string>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 4 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    const t = (v as Record<string, unknown>)["@type"];
    if (typeof t === "string") out.add(t);
    if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && out.add(x));
    for (const child of Object.values(v)) visit(child, depth + 1);
  };
  visit(data, 0);
  return [...out];
}
