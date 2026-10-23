// Optional, caller-supplied external engines (REA's model: detected, never
// auto-installed). Each resolves from an env var, then PATH, then common
// install dirs, and reports why it is unavailable.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { commandFor, findOnPath, home } from "../core/platform.ts";

export interface ExternalTool {
  id: string;
  env: string;
  bins: string[];
  install: string;
  purpose: string;
}

export const TOOLS: Record<string, ExternalTool> = {
  jsluice: {
    id: "jsluice",
    env: "REA_FROM_API_JSLUICE",
    bins: ["jsluice"],
    install: "go install github.com/BishopFox/jsluice/cmd/jsluice@latest",
    purpose: "AST-based URL/method/header extraction from JavaScript (BishopFox, MIT)",
  },
  schemathesis: {
    id: "schemathesis",
    env: "REA_FROM_API_SCHEMATHESIS",
    bins: ["schemathesis", "st"],
    install: "pipx install schemathesis   # or: pip install schemathesis",
    purpose: "Property-based testing of the exported OpenAPI (GET-only, rate-limited)",
  },
  oasdiff: {
    id: "oasdiff",
    env: "REA_FROM_API_OASDIFF",
    bins: ["oasdiff"],
    install: "go install github.com/oasdiff/oasdiff@latest",
    purpose: "Breaking-change classification between two OpenAPI documents",
  },
};

const EXTRA_DIRS = () => [
  join(home(), "go", "bin"),
  join(home(), ".local", "bin"),
  "/usr/local/bin",
  ...(process.env.APPDATA ? [join(process.env.APPDATA, "Python", "Scripts")] : []),
];

export function findTool(id: keyof typeof TOOLS | string): string | undefined {
  const t = TOOLS[id];
  if (!t) return undefined;
  const env = process.env[t.env];
  if (env) return existsSync(env) ? env : undefined;
  return findOnPath(t.bins, EXTRA_DIRS());
}

export function runTool(bin: string, args: string[], timeoutMs: number, env: NodeJS.ProcessEnv = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const { cmd, pre } = commandFor(bin);
    execFile(cmd, [...pre, ...args], { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === "number" ? Number((err as { code: number }).code) : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}
