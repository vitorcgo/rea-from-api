import type { Strategy } from "./types.ts";
import { expandSeed } from "../core/inventory.ts";

/**
 * Candidate endpoints supplied explicitly (by the user, or by the agent after
 * reading official documentation). `{name:example}` placeholders declare a
 * path parameter and the value used for verification, e.g.
 *   https://pypi.org/pypi/{project:requests}/json
 */
export const seeds: Strategy = {
  id: "seeds",
  description: "Register explicitly supplied candidate URLs (from official docs or the user) for verification",
  skip: (ctx) => (ctx.input.seeds.length ? undefined : "no --seed URLs"),
  async run(ctx) {
    for (const s of ctx.input.seeds) {
      const { url, template } = expandSeed(s);
      const ev = ctx.evidence.add({ strategy: this.id, kind: "note", source: s, summary: `Seed candidate supplied by caller: ${s}` });
      ctx.inventory.add({
        method: "GET",
        url,
        template,
        strategy: this.id,
        evidenceId: ev.id,
        status: "inferred",
        note: "Supplied as seed (e.g. from official documentation); needs verification",
      });
    }
    return { status: "ok", detail: `${ctx.input.seeds.length} seeds registered` };
  },
};
