#!/usr/bin/env node
// Thin launcher: Node >= 22.18 runs the TypeScript sources directly (type stripping).
// import() needs a file:// URL: a raw "V:\..." path fails on Windows.
await import(new URL("../src/cli.ts", import.meta.url).href);
