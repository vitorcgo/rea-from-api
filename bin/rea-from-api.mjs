#!/usr/bin/env node
// Thin launcher: Node >= 22.18 runs the TypeScript sources directly (type stripping).
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
await import(join(here, "..", "src", "cli.ts"));
