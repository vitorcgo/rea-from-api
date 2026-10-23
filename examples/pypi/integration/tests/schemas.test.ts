import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ValidationError } from "../src/errors.ts";
import { validatePypiByProjectVersionResponse, validatePypiResponse } from "../src/schemas.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

test("PypiByProjectVersionResponse accepts the recorded response", () => {
  assert.doesNotThrow(() => validatePypiByProjectVersionResponse(fixture("getPypiByProjectVersion")));
});

test("PypiByProjectVersionResponse rejects a drifted response", () => {
  assert.throws(() => validatePypiByProjectVersionResponse("not-the-observed-shape"), ValidationError);
});

test("PypiResponse accepts the recorded response", () => {
  assert.doesNotThrow(() => validatePypiResponse(fixture("getPypi")));
});

test("PypiResponse rejects a drifted response", () => {
  assert.throws(() => validatePypiResponse("not-the-observed-shape"), ValidationError);
});
