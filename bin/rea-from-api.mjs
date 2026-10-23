#!/usr/bin/env node
// Launcher. In a git checkout it runs the TypeScript sources directly (Node type
// stripping); in an npm/npx install it runs the compiled dist/ (Node refuses to
// strip types inside node_modules). import() needs a file:// URL on Windows.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = new URL("../src/cli.ts", import.meta.url);
const dist = new URL("../dist/cli.js", import.meta.url);
await import((existsSync(fileURLToPath(src)) ? src : dist).href);
