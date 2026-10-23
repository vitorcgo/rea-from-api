# Extending

## New investigation strategy

1. Create `src/strategies/<name>.ts` exporting a `Strategy` (`src/strategies/types.ts`):
   `id`, `description`, optional `skip(ctx)` returning a reason, and `run(ctx)`.
2. Issue requests only through `ctx.http` (budget, robots, pacing, redaction apply).
3. Record every claim with `ctx.evidence.add(...)` and feed endpoints through
   `ctx.inventory.add(...)` with the honest status (`inferred` unless a response was
   seen). Put redacted JSON samples in `ctx.samples`.
4. Register it in `src/strategies/index.ts` (order matters; `verify` stays last) and
   add a fixture case in `tests/fixtures/site.ts` + a test in `tests/pipeline.test.ts`.

Ideas: sitemap.xml (bounded), RSS/Atom feeds, `Accept: application/json` content
negotiation on the page URL, Postman public collections, gRPC-web reflection.

## New generator (e.g. Go)

`plan.json` is language-neutral (sources, params, pagination, schema, dependencies,
auth env var, cache, pacing). Add `src/generate/<lang>.ts` producing files from an
`IntegrationPlan` (see `typescript.ts` and `python.ts`), route it in
`operations.generateIntegration`, and add the corresponding checks to `validate.ts`.
Alternatively feed `investigation/openapi.json` to an ecosystem generator.

## New optional engine

Add it to `TOOLS` in `src/providers/external.ts` (env var, binary names, install hint,
purpose). `findTool` resolves it; `doctor` lists it automatically.
