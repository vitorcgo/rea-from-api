// Turns an investigation into an integration plan + Mermaid diagram.
// The diagram is rendered from the plan, which is exactly what the generator
// consumes, so the diagram always reflects the code that gets generated.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EndpointRecord, Investigation, JsonSchema, PaginationInfo } from "../core/types.ts";
import { getPath } from "../analysis/schema.ts";
import { schemaToTs } from "../generate/tsTypes.ts";

export interface PlanSource {
  endpointId: string;
  fnName: string;
  typeName: string;
  method: "GET";
  urlTemplate: string;
  pathParams: string[];
  /** Concrete values seen for path params (from the verified example URL). */
  examples: Record<string, string>;
  queryParams: { name: string; role?: string; example?: string }[];
  pagination?: PaginationInfo;
  itemsField?: string;
  schema?: JsonSchema;
  auth: EndpointRecord["auth"];
  documented: boolean;
  status: EndpointRecord["status"];
  cacheTtlMs: number;
  sampleFile?: string;
}

export interface PlanEmbeddedSource {
  fnName: string;
  typeName: string;
  pageUrl: string;
  kind: string;
  selector: string;
  schema?: JsonSchema;
  sampleFile?: string;
}

export interface PlanDependency {
  from: string;
  to: string;
  param: string;
  field: string;
}

export interface TargetInfo {
  kind: "none" | "node-ts" | "node-js" | "python" | "other";
  root?: string;
  integrationDir: string;
  moduleSystem: "esm" | "cjs";
  notes: string[];
}

export interface IntegrationPlan {
  name: string;
  goal: string;
  sourceUrl: string;
  language: "typescript" | "python";
  strategy: "json-api" | "embedded-json" | "mixed" | "none";
  sources: PlanSource[];
  embedded: PlanEmbeddedSource[];
  dependencies: PlanDependency[];
  executionOrder: string[];
  auth: { required: boolean; envVar?: string; header?: string; scheme?: string; query?: string; note: string };
  rateLimit: { minIntervalMs: number; basis: string };
  cache: { kind: "memory-ttl"; defaultTtlMs: number };
  errors: string[];
  transformations: string[];
  target: TargetInfo;
  excluded: { endpointId: string; reason: string }[];
  risks: string[];
}

export interface PlanOptions {
  select?: string[];
  name?: string;
  maxSources?: number;
  minRelevance?: number;
}

export function buildPlan(inv: Investigation, opts: PlanOptions = {}): IntegrationPlan {
  const name = opts.name ?? deriveName(inv.input.url);
  const excluded: IntegrationPlan["excluded"] = [];
  const max = opts.maxSources ?? 6;
  const minRel = opts.minRelevance ?? 0.15;

  let chosen: EndpointRecord[];
  if (opts.select?.length) {
    chosen = opts.select.map((id) => {
      const ep = inv.endpoints.find((e) => e.id === id);
      if (!ep) throw new Error(`unknown endpoint id ${id}`);
      return ep;
    });
  } else {
    chosen = inv.endpoints.filter((e) => e.status === "confirmed" && e.responseFormat === "json" && e.method === "GET" && e.goalRelevance >= minRel).slice(0, max);
  }
  for (const e of inv.endpoints) {
    if (chosen.includes(e)) continue;
    const reason =
      /graphql/i.test(e.bodyFormat ?? "") ? "GraphQL: schema exported (samples/graphql-schema-*.json); typed operations are not generated automatically"
      : e.method !== "GET" ? "write operation: never generated automatically"
      : e.status !== "confirmed" ? `not confirmed (${e.status}, test ${e.testStatus})`
      : e.responseFormat !== "json" ? `response format ${e.responseFormat}`
      : e.goalRelevance < minRel ? `low goal relevance (${e.goalRelevance})`
      : "outside --max-sources";
    excluded.push({ endpointId: e.id, reason });
  }
  for (const e of chosen)
    if (e.method !== "GET") throw new Error(`endpoint ${e.id} is ${e.method}; only read-only GET integrations are generated automatically`);

  const usedNames = new Set<string>();
  const usedTypes = new Set<string>();
  const sources: PlanSource[] = chosen.map((e) => {
    const fn = uniqueName(fnNameFor(e), usedNames);
    return {
      endpointId: e.id,
      fnName: fn,
      typeName: uniqueName(typeNameFor(fn), usedTypes),
      method: "GET",
      urlTemplate: e.urlTemplate,
      pathParams: e.pathParams,
      examples: pathExamples(e.urlTemplate, e.exampleUrl),
      queryParams: e.queryParams.filter((q) => !q.sensitive).map((q) => ({ name: q.name, role: q.role, example: q.example })),
      pagination: e.pagination,
      itemsField: e.pagination?.itemsField,
      schema: e.schema,
      auth: e.auth,
      documented: e.documented,
      status: e.status,
      cacheTtlMs: 60_000,
    };
  });

  const embedded: PlanEmbeddedSource[] =
    sources.length === 0
      ? inv.embedded
          .filter((e) => e.schema && e.kind !== "nuxt")
          .slice(0, 3)
          .map((e, i) => {
            const fn = uniqueName(`get${pascal(e.kind === "json-ld" ? (e.types?.[0] ?? "StructuredData") : e.kind)}${i ? i + 1 : ""}`, usedNames);
            return { fnName: fn, typeName: uniqueName(typeNameFor(fn), usedTypes), pageUrl: e.pageUrl, kind: e.kind, selector: e.selector, schema: e.schema, sampleFile: e.sampleFile };
          })
      : [];

  const dependencies = findDependencies(sources);
  const order = topo(sources.map((s) => s.fnName), dependencies);
  const authRequired = sources.some((s) => s.auth === "required" || s.auth === "credential");
  const userAuth = inv.input.auth;
  const authHeader = userAuth?.header ?? "Authorization";
  const rateHeaders = inv.endpoints.find((e) => chosen.includes(e) && e.rateLimit)?.rateLimit;

  return {
    name,
    goal: inv.input.goal,
    sourceUrl: inv.input.url,
    language: "typescript",
    strategy: sources.length && embedded.length ? "mixed" : sources.length ? "json-api" : embedded.length ? "embedded-json" : "none",
    sources,
    embedded,
    dependencies,
    executionOrder: order,
    auth: authRequired
      ? {
          required: true,
          envVar: `${constName(name)}_TOKEN`,
          header: userAuth?.query ? undefined : authHeader,
          scheme: userAuth?.query ? undefined : (userAuth?.scheme ?? (authHeader.toLowerCase() === "authorization" ? "Bearer " : "")),
          query: userAuth?.query,
          note: userAuth
            ? `Verified with your own credential (${userAuth.query ? `query parameter "${userAuth.query}"` : `header ${authHeader}`}). The client reads it from the environment; it is never stored.`
            : "At least one endpoint answered 401/403. Provide your own authorized token via env; nothing is extracted from the site.",
        }
      : { required: false, note: "Selected endpoints answered without credentials during verification." },
    rateLimit: rateHeaders
      ? { minIntervalMs: 1000, basis: `rate-limit headers observed: ${Object.keys(rateHeaders).join(", ")}` }
      : { minIntervalMs: 500, basis: "no rate-limit headers observed; conservative default of 2 req/s" },
    cache: { kind: "memory-ttl", defaultTtlMs: 60_000 },
    errors: [
      "HttpError (non-2xx) with status, retryable flag and redacted URL",
      "ValidationError when a response no longer matches the observed schema (format drift)",
      "TimeoutError per request (AbortSignal)",
      "bounded retries with exponential backoff for network errors, 429 (honouring Retry-After up to a cap) and 502/503/504",
    ],
    transformations: [
      ...sources.filter((s) => s.itemsField).map((s) => `${s.fnName}: extract records from \`${s.itemsField}\``),
      ...embedded.map((e) => `${e.fnName}: parse ${e.kind} block (${e.selector}) from HTML`),
    ],
    target: detectTarget(inv.input.targetProject, name),
    excluded,
    risks: [
      ...(sources.some((s) => !s.documented) ? ["Some sources are undocumented internal endpoints: they may change or be withdrawn; schema validation will surface drift."] : []),
      ...(embedded.length ? ["Embedded HTML data depends on page markup; selector changes break extraction."] : []),
      "Respect the site's terms of use, robots.txt and rate limits; confirm that reuse/redistribution of the data is permitted.",
    ],
  };
}

export function renderMermaid(plan: IntegrationPlan): string {
  const L = ["flowchart LR"];
  const id = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_");
  const q = (s: string) => s.replace(/"/g, "'");
  L.push(`  consumer["${q(plan.target.kind === "none" ? "Consumer code (examples/)" : `Target project (${plan.target.integrationDir})`)}"]`);
  L.push(`  cache[("In-memory TTL cache<br/>${plan.cache.defaultTtlMs / 1000}s")]`);
  L.push(`  client["HTTP client<br/>timeout · bounded retry · ${plan.rateLimit.minIntervalMs}ms pacing"]`);
  for (const s of plan.sources) {
    const u = new URL(s.urlTemplate.replace(/\{/g, "%7B").replace(/\}/g, "%7D"));
    L.push(`  src_${id(s.fnName)}[/"${q(`${s.method} ${u.host}${decodeURIComponent(u.pathname)}`)}<br/>${s.documented ? "documented" : "undocumented"} · ${s.status}"/]`);
    L.push(`  fn_${id(s.fnName)}["${s.fnName}()${s.pagination ? `<br/>paginate: ${s.pagination.style}` : ""}"]`);
    L.push(`  val_${id(s.fnName)}{{"validate ${s.typeName}"}}`);
    L.push(`  src_${id(s.fnName)} --> client --> val_${id(s.fnName)} --> fn_${id(s.fnName)}`);
    L.push(`  fn_${id(s.fnName)} <--> cache`);
    L.push(`  fn_${id(s.fnName)} --> consumer`);
  }
  for (const e of plan.embedded) {
    L.push(`  page_${id(e.fnName)}[/"HTML page ${q(new URL(e.pageUrl).host)}<br/>${q(e.selector)}"/]`);
    L.push(`  ex_${id(e.fnName)}["extract ${e.kind}<br/>${e.fnName}()"]`);
    L.push(`  val_${id(e.fnName)}{{"validate ${e.typeName}"}}`);
    L.push(`  page_${id(e.fnName)} --> client --> ex_${id(e.fnName)} --> val_${id(e.fnName)} --> consumer`);
  }
  for (const d of plan.dependencies) L.push(`  fn_${id(d.from)} -. "${q(d.field)} → {${q(d.param)}}" .-> fn_${id(d.to)}`);
  if (plan.auth.required) L.push(`  env[["env ${plan.auth.envVar}"]] -.-> client`);
  return `${L.join("\n")}\n`;
}

export function writePlan(dir: string, plan: IntegrationPlan): void {
  const arch = join(dir, "architecture");
  mkdirSync(arch, { recursive: true });
  writeFileSync(join(arch, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  writeFileSync(join(arch, "flow.mmd"), renderMermaid(plan));
  const types = [...plan.sources.map((s) => schemaToTs(s.typeName, s.schema)), ...plan.embedded.map((e) => schemaToTs(e.typeName, e.schema))];
  writeFileSync(join(arch, "data-models.ts"), `// Types inferred from observed responses (not from documentation).\n\n${types.join("\n\n")}\n`);
  writeFileSync(join(arch, "plan.md"), renderPlanMd(plan));
}

export function renderPlanMd(p: IntegrationPlan): string {
  const L = [`# Integration plan: ${p.name}`, "", `Goal: ${p.goal}`, "", `Strategy: **${p.strategy}** · language: ${p.language}`, ""];
  L.push("## Sources", "");
  for (const s of p.sources)
    L.push(`- \`${s.fnName}\` ← \`${s.method} ${s.urlTemplate}\` (${s.documented ? "documented" : "undocumented"}, ${s.status}, auth ${s.auth}${s.pagination ? `, pagination ${s.pagination.style}` : ""})`);
  for (const e of p.embedded) L.push(`- \`${e.fnName}\` ← ${e.kind} \`${e.selector}\` in ${e.pageUrl}`);
  if (!p.sources.length && !p.embedded.length) L.push("- none: nothing confirmed is suitable; see investigation/findings.md");
  L.push("", "## Execution order", "", p.executionOrder.map((x, i) => `${i + 1}. ${x}`).join("\n") || "_n/a_", "");
  if (p.dependencies.length) L.push("## Dependencies", "", ...p.dependencies.map((d) => `- ${d.to}({${d.param}}) uses \`${d.field}\` from ${d.from}`), "");
  L.push("## Transformations", "", ...(p.transformations.length ? p.transformations.map((t) => `- ${t}`) : ["- none"]), "");
  L.push("## Errors, retries, cache, rate limit", "", ...p.errors.map((e) => `- ${e}`), `- cache: ${p.cache.kind}, default TTL ${p.cache.defaultTtlMs} ms`, `- pacing: ${p.rateLimit.minIntervalMs} ms between requests (${p.rateLimit.basis})`, "");
  L.push("## Authentication", "", `- ${p.auth.note}${p.auth.envVar ? ` Env var: \`${p.auth.envVar}\`.` : ""}`, "");
  L.push("## Target", "", `- kind: ${p.target.kind}; output: \`${p.target.integrationDir}\``, ...p.target.notes.map((n) => `- ${n}`), "");
  L.push("## Risks", "", ...p.risks.map((r) => `- ${r}`), "");
  L.push("## Excluded endpoints", "", ...p.excluded.slice(0, 40).map((x) => `- ${x.endpointId}: ${x.reason}`), "");
  L.push("## Diagram", "", "```mermaid", renderMermaid(p).trimEnd(), "```", "");
  return L.join("\n");
}

// ---- helpers -----------------------------------------------------------------

export function pathExamples(template: string, example: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const t = decodeURIComponent(new URL(template.replace(/\{/g, "%7B").replace(/\}/g, "%7D")).pathname).split("/");
    const e = new URL(example).pathname.split("/");
    t.forEach((seg, i) => {
      const m = /^\{(\w+)\}$/.exec(seg);
      if (m?.[1] && e[i] !== undefined && !/^\{/.test(decodeURIComponent(e[i]!))) out[m[1]] = decodeURIComponent(e[i]!);
    });
  } catch {
    /* keep empty */
  }
  return out;
}

function deriveName(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const first = /^[\d.]+$|^\[/.test(host) ? "local" : (host.split(".")[0] ?? "site");
  const slug = first.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `${/^[a-z]/.test(slug) ? "" : "site-"}${slug}-api`;
}

export function pascal(s: string): string {
  return s
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

export const constName = (s: string) => {
  const c = s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  return /^[A-Z]/.test(c) ? c : `API_${c}`;
};

function fnNameFor(e: EndpointRecord): string {
  const u = new URL(e.urlTemplate.replace(/\{/g, "%7B").replace(/\}/g, "%7D"));
  const segs = decodeURIComponent(u.pathname)
    .split("/")
    .filter((s) => s && !/^(api|v\d+(\.\d+)?|rest|public|json|wp-json)$/i.test(s));
  const fixed = segs.filter((s) => !s.startsWith("{"));
  const last = fixed.at(-1) ?? "resource";
  const single = segs.at(-1)?.startsWith("{") || e.pathParams.length > 0;
  const prefix = single ? "get" : e.pagination ? "list" : "get";
  const tail = single ? [...fixed.slice(-2, -1), singular(last)] : fixed.slice(-2);
  const base = tail.join(" ") || last;
  // /products/{id} reads naturally as getProduct; anything else names its params:
  // /pypi/{project}/{version}/json → getPypiByProjectVersion.
  const natural = e.pathParams.length === 1 && segs.at(-1) === `{${e.pathParams[0]}}` && !segs.at(-2)?.startsWith("{");
  const by = single && e.pathParams.length && !natural ? `By${e.pathParams.map(pascal).join("")}` : "";
  return prefix + pascal(base.replace(/\.json$/, "")) + by;
}

function singular(w: string): string {
  if (/ies$/i.test(w)) return w.replace(/ies$/i, "y");
  if (/(ss|us|is)$/i.test(w)) return w;
  if (/(xes|ches|shes|sses)$/i.test(w)) return w.replace(/es$/i, "");
  return w.replace(/s$/i, "");
}

const typeNameFor = (fn: string) => pascal(fn.replace(/^(get|list)/, "")) + "Response";

function uniqueName(n: string, used: Set<string>): string {
  let name = n || "getResource";
  let i = 2;
  while (used.has(name)) name = `${n}${i++}`;
  used.add(name);
  return name;
}

/** A list source whose items carry `id`/`slug`/`<x>Id` feeding a detail source's path param. */
function findDependencies(sources: PlanSource[]): PlanDependency[] {
  const deps: PlanDependency[] = [];
  for (const to of sources) {
    for (const param of to.pathParams) {
      for (const from of sources) {
        if (from === to || !from.schema) continue;
        const item = itemSchema(from);
        const fields = Object.keys(item?.properties ?? {});
        const want = param.replace(/Id$/, "").toLowerCase();
        // Generic params ({id}, {slug}) only link to the parent collection (/products → /products/{id});
        // named ones (productId) also link to a collection of the same noun.
        const parent = to.urlTemplate.slice(0, to.urlTemplate.indexOf(`{${param}}`)).replace(/\/$/, "");
        const generic = /^(id|slug|uuid|key|name|param\d*)$/i.test(param);
        const sameNoun = from.urlTemplate === parent || (!generic && want.length > 1 && from.urlTemplate.toLowerCase().includes(`/${want}`));
        if (generic && from.urlTemplate !== parent) continue;
        const field =
          fields.find((f) => f === param) ??
          fields.find((f) => f.toLowerCase() === `${want}id` || f.toLowerCase() === `${want}_id`) ??
          (sameNoun ? (fields.includes("id") ? "id" : fields.includes("slug") ? "slug" : undefined) : undefined);
        if (field && from.urlTemplate !== to.urlTemplate) deps.push({ from: from.fnName, to: to.fnName, param, field });
      }
    }
  }
  return deps;
}

function itemSchema(s: PlanSource): JsonSchema | undefined {
  let cur = s.schema;
  if (s.itemsField) for (const k of s.itemsField.split(".")) cur = cur?.properties?.[k];
  else if (cur?.type === "array") cur = cur.items;
  if (cur?.type === "array") cur = cur.items;
  return cur?.type === "object" ? cur : undefined;
}

function topo(nodes: string[], deps: PlanDependency[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (n: string, stack: Set<string>) => {
    if (seen.has(n) || stack.has(n)) return;
    stack.add(n);
    for (const d of deps.filter((x) => x.to === n)) visit(d.from, stack);
    seen.add(n);
    out.push(n);
  };
  for (const n of nodes) visit(n, new Set());
  return out;
}

export function detectTarget(root: string | undefined, name: string): TargetInfo {
  if (!root) return { kind: "none", integrationDir: "integration", moduleSystem: "esm", notes: ["No target project given: a standalone package is generated."] };
  const notes: string[] = [];
  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { type?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const ts = existsSync(join(root, "tsconfig.json")) || !!pkg.devDependencies?.typescript || !!pkg.dependencies?.typescript;
    const dir = existsSync(join(root, "src")) ? join("src", "integrations", name) : join("integrations", name);
    if (!ts) notes.push("Project has no TypeScript config; generated .ts files need Node >= 22.18 (type stripping) or a TS toolchain.");
    if (pkg.type !== "module") notes.push("Project is CommonJS; generated code is ESM; import it from ESM or a bundler.");
    return { kind: ts ? "node-ts" : "node-js", root, integrationDir: dir, moduleSystem: pkg.type === "module" ? "esm" : "cjs", notes };
  }
  if (existsSync(join(root, "pyproject.toml")) || existsSync(join(root, "requirements.txt")))
    return { kind: "python", root, integrationDir: join("integrations", name), moduleSystem: "esm", notes: ["Python project detected: generating a standard-library-only Python client (urllib + TypedDict + unittest)."] };
  return { kind: "other", root, integrationDir: join("integrations", name), moduleSystem: "esm", notes: ["Unrecognised project type: generating a self-contained TypeScript package inside it."] };
}

export function itemsFromSample(sample: unknown, itemsField?: string): unknown {
  return itemsField ? getPath(sample, itemsField) : sample;
}
