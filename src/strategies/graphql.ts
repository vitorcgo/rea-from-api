import type { Strategy, InvestigationContext } from "./types.ts";
import { BlockedByPolicy, BudgetExceeded } from "../core/http.ts";
import { sameSite } from "./specIngest.ts";

interface GqlTypeRef {
  kind: string;
  name: string | null;
  ofType?: GqlTypeRef | null;
}
interface GqlField {
  name: string;
  description?: string | null;
  args: { name: string; type: GqlTypeRef }[];
  type: GqlTypeRef;
}
interface GqlSchema {
  queryType: { name: string } | null;
  mutationType: { name: string } | null;
  subscriptionType: { name: string } | null;
  types: { kind: string; name: string; fields: GqlField[] | null }[];
}

export const typeRefToString = (t: GqlTypeRef | null | undefined): string =>
  !t ? "?" : t.kind === "NON_NULL" ? `${typeRefToString(t.ofType)}!` : t.kind === "LIST" ? `[${typeRefToString(t.ofType)}]` : (t.name ?? "?");

/**
 * GraphQL endpoints found by other strategies (traffic, JS, framework) get one
 * standard introspection query. If introspection is disabled the endpoint is
 * reported as such: schema guessing via field suggestions/wordlists is out of
 * scope by design (see docs/research.md).
 */
export const graphql: Strategy = {
  id: "graphql",
  description: "Detect GraphQL endpoints and run the standard introspection query once (no field brute forcing)",
  async run(ctx) {
    const candidates = ctx.inventory.all.filter((e) => /graphql|\/gql(\/|$)/i.test(new URL(e.urlTemplate.replace(/[{}]/g, "")).pathname));
    const origin = new URL(ctx.input.url).origin;
    if (!candidates.length && /graphql|__APOLLO_STATE__|apollo/i.test(ctx.page?.html ?? "")) {
      const ev = ctx.evidence.add({ strategy: this.id, kind: "html-analysis", source: ctx.input.url, summary: "GraphQL/Apollo markers in HTML; probing /graphql" });
      candidates.push(ctx.inventory.add({ method: "POST", url: `${origin}/graphql`, strategy: this.id, evidenceId: ev.id, status: "inferred", note: "Conventional GraphQL path derived from Apollo/GraphQL markers" }));
    }
    const urls = [...new Set(candidates.map((c) => c.exampleUrl.split("?")[0]!))].filter((u) => ctx.allowedOrigins.has(new URL(u).origin) || sameSite(u, ctx.input.url)).slice(0, 2);
    if (!urls.length) return { status: "skipped", detail: "no GraphQL endpoint observed" };
    const results: string[] = [];
    for (const url of urls) results.push(await introspect(ctx, url));
    return { status: "ok", detail: results.join("; ") };
  },
};

async function introspect(ctx: InvestigationContext, url: string): Promise<string> {
  try {
    const r = await ctx.http.request(url, { method: "POST", graphqlIntrospection: true, accept: "application/json" });
    let body: { data?: { __schema?: GqlSchema }; errors?: { message?: string }[] } | undefined;
    try {
      body = JSON.parse(r.text);
    } catch {
      body = undefined;
    }
    const schema = body?.data?.__schema;
    const ev = ctx.evidence.add({
      strategy: "graphql",
      kind: "verification",
      source: url,
      summary: `GraphQL introspection → ${r.status}${schema ? ` (${schema.types.length} types)` : body?.errors?.[0]?.message ? `: ${body.errors[0].message.slice(0, 120)}` : ""}`,
      sha256: r.sha256,
      status: r.status,
      contentType: r.contentType,
    });
    const rec = ctx.inventory.add({ method: "POST", url, strategy: "graphql", evidenceId: ev.id, status: schema ? "confirmed" : r.ok ? "observed" : "unavailable", responseFormat: "json", httpStatus: r.status, bodyFormat: "GraphQL (application/json)" });
    if (!schema) {
      rec.notes.push(r.status === 401 || r.status === 403 ? "GraphQL requires authorization." : "Introspection disabled or not GraphQL; operations must come from observed traffic (REA browser capture / HAR).");
      return `${url}: introspection unavailable (${r.status})`;
    }
    const byName = new Map(schema.types.map((t) => [t.name, t]));
    const root = (n: { name: string } | null) => (n ? (byName.get(n.name)?.fields ?? []) : []);
    const queries = root(schema.queryType);
    const mutations = root(schema.mutationType);
    const sdl = [
      `type ${schema.queryType?.name ?? "Query"} {`,
      ...queries.map((f) => `  ${f.name}${f.args.length ? `(${f.args.map((a) => `${a.name}: ${typeRefToString(a.type)}`).join(", ")})` : ""}: ${typeRefToString(f.type)}`),
      "}",
      ...(mutations.length ? [`# ${mutations.length} mutations exist (never called by rea-from-api)`] : []),
    ].join("\n");
    rec.status = "confirmed";
    rec.testStatus = "passed";
    rec.auth = "none";
    rec.verifiedAt = new Date().toISOString();
    rec.purpose = `GraphQL API: ${queries.length} queries (${queries.slice(0, 8).map((q) => q.name).join(", ")}${queries.length > 8 ? ", …" : ""})`;
    rec.notes.push(`Schema saved to ${ctx.saveSample(`graphql-schema-${new URL(url).hostname}`, { sdl, schema })}`);
    ctx.evidence.add({ strategy: "graphql", kind: "spec", source: url, summary: `GraphQL schema: ${queries.length} queries, ${mutations.length} mutations, ${schema.types.length} types` });
    return `${url}: ${queries.length} queries via introspection`;
  } catch (e) {
    if (e instanceof BudgetExceeded) throw e;
    return `${url}: ${e instanceof BlockedByPolicy ? e.message : (e as Error).message}`;
  }
}
