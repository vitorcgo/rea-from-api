// Offline tests: a local server replays the recorded (redacted) responses.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { createClient, HttpError } from "../src/index.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
const routes: { re: RegExp; fixture: string }[] = [
  { re: /^\/pypi\/[^\/]+\/[^\/]+\/json$/, fixture: "getPypiByProjectVersion" },
  { re: /^\/pypi\/[^\/]+\/json$/, fixture: "getPypi" },
];
let failNext = 0;
let hits = 0;
const server = createServer((req, res) => {
  hits++;
  if (failNext > 0) {
    failNext--;
    res.writeHead(503).end();
    return;
  }
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  const r = routes.find((x) => x.re.test(path));
  if (!r) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' }).end(fixture(r.fixture));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => server.close());
const client = createClient({ baseUrl, minIntervalMs: 0, maxRetries: 2, timeoutMs: 2000 });

test("getPypiByProjectVersion returns validated data", async () => {
  const data = await client.getPypiByProjectVersion({ project: "requests", version: "2.32.3" }, {});
  assert.ok(data !== undefined && data !== null);
});

test("getPypi returns validated data", async () => {
  const data = await client.getPypi({ project: "requests" }, {});
  assert.ok(data !== undefined && data !== null);
});

test('retries transient 503 then succeeds', async () => {
  failNext = 1;
  client.clearCache();
  await client.getPypiByProjectVersion({ project: "requests", version: "2.32.3" }, {});
  assert.equal(failNext, 0);
});

test('gives up after maxRetries with HttpError', async () => {
  failNext = 10;
  client.clearCache();
  await assert.rejects(client.getPypiByProjectVersion({ project: "requests", version: "2.32.3" }, {}), HttpError);
  failNext = 0;
});

test('serves repeated calls from cache', async () => {
  client.clearCache();
  await client.getPypiByProjectVersion({ project: "requests", version: "2.32.3" }, {});
  const before = hits;
  await client.getPypiByProjectVersion({ project: "requests", version: "2.32.3" }, {});
  assert.equal(hits, before);
});
