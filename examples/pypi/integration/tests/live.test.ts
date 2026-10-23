// Live smoke tests against the real source. Opt-in: LIVE=1 node --test tests/live.test.ts
// They issue a handful of read-only GET requests; keep them out of tight CI loops.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "../src/index.ts";

const live = process.env.LIVE === '1';
const client = createClient({ cacheTtlMs: 0 });

test("live: getPypiByProjectVersion", { skip: !live && 'set LIVE=1' }, async () => {
  const data = await client.getPypiByProjectVersion({ project: "requests", version: "2.32.3" }, {});
  assert.ok(data !== undefined && data !== null);
});

test("live: getPypi", { skip: !live && 'set LIVE=1' }, async () => {
  const data = await client.getPypi({ project: "requests" }, {});
  assert.ok(data !== undefined && data !== null);
});
