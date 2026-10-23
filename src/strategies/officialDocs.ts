import type { Strategy } from "./types.ts";
import { ingestSpecUrl } from "./specIngest.ts";

// Well-known locations for machine-readable API descriptions. Probed only on
// the target origin, a bounded number of times, with GET.
const SPEC_PATHS = [
  "/openapi.json",
  "/openapi.yaml",
  "/swagger.json",
  "/api/openapi.json",
  "/v3/api-docs",
  "/api-docs",
  "/swagger/v1/swagger.json",
  "/.well-known/openapi.json",
  "/api/swagger.json",
  "/wp-json/",
  "/api",
];

/** Looks for official documentation and OpenAPI/Swagger specs, and records robots.txt. */
export const officialDocs: Strategy = {
  id: "official-docs",
  description: "Read robots.txt, probe well-known OpenAPI/Swagger locations, follow alternate/doc links; parse specs into documented endpoints",
  async run(ctx) {
    const origin = new URL(ctx.input.url).origin;
    const robots = await ctx.http.robots(origin);
    ctx.evidence.add({
      strategy: this.id,
      kind: "robots",
      source: `${origin}/robots.txt`,
      summary: robots.found ? "robots.txt found; replays are filtered by its rules" : "no robots.txt (or not text); all paths allowed by default",
    });

    const candidates: string[] = [];
    for (const a of ctx.page?.analysis.alternates ?? []) candidates.push(a);
    for (const l of ctx.page?.analysis.docLinks ?? []) if (/openapi|swagger|api-docs|\.json$/i.test(l)) candidates.push(l);
    for (const p of SPEC_PATHS) candidates.push(origin + p);

    let specs = 0;
    let probes = 0;
    for (const url of [...new Set(candidates)]) {
      if (probes >= ctx.limits.maxSpecProbes) break;
      if (!ctx.allowedOrigins.has(new URL(url).origin)) continue;
      probes++;
      specs += await ingestSpecUrl(ctx, url, { strategy: this.id });
    }
    const offOrigin = (ctx.page?.analysis.docLinks ?? []).filter((l) => !ctx.allowedOrigins.has(new URL(l).origin));
    if (offOrigin.length)
      ctx.limitations.push(
        `Documentation links on other origins were not fetched automatically (re-run with --allow-origin to include them): ${offOrigin.slice(0, 5).join(", ")}`,
      );
    return {
      status: "ok",
      detail: `${probes} probes; ${specs} documented operations from specs`,
    };
  },
};

