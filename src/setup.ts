// `rea-from-api setup`: registers the MCP server and installs the skill for
// supported agents (REA's `npx rea-agents setup` model). Every file it changes
// is backed up first; --dry-run only prints the plan.

import { copyFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync, lstatSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LAUNCHER = join(ROOT, "bin", "rea-from-api.mjs");

interface AgentTarget {
  id: string;
  label: string;
  /** JSON config file with an `mcpServers` map. */
  config: string;
  skillDir?: string;
}

function agents(): AgentTarget[] {
  const h = homedir();
  return [
    { id: "claude-code", label: "Claude Code", config: join(h, ".claude.json"), skillDir: join(h, ".claude", "skills", "rea-from-api") },
    { id: "cursor", label: "Cursor", config: join(h, ".cursor", "mcp.json") },
    { id: "gemini", label: "Gemini CLI", config: join(h, ".gemini", "settings.json") },
    { id: "project", label: "This project (.mcp.json)", config: resolve(".mcp.json"), skillDir: resolve(".claude", "skills", "rea-from-api") },
  ];
}

export function mcpEntry(): { command: string; args: string[] } {
  return { command: process.execPath, args: [LAUNCHER, "mcp"] };
}

export function setup(o: { agents?: string[]; dryRun?: boolean; say: (s: string) => void }): number {
  const all = agents();
  const chosen = o.agents?.length ? all.filter((a) => o.agents!.includes(a.id)) : all.filter((a) => a.id === "project");
  if (!chosen.length) {
    o.say(`unknown agent; choose from: ${all.map((a) => a.id).join(", ")}`);
    return 1;
  }
  const entry = mcpEntry();
  for (const a of chosen) {
    o.say(`${a.label}: add MCP server "rea-from-api" → ${a.config}`);
    if (a.skillDir) o.say(`${a.label}: link skill → ${a.skillDir}`);
    if (o.dryRun) continue;
    let cfg: { mcpServers?: Record<string, unknown> } = {};
    if (existsSync(a.config)) {
      copyFileSync(a.config, `${a.config}.bak-rea-from-api`);
      cfg = JSON.parse(readFileSync(a.config, "utf8") || "{}");
    } else mkdirSync(dirname(a.config), { recursive: true });
    cfg.mcpServers = { ...(cfg.mcpServers ?? {}), "rea-from-api": { type: "stdio", ...entry } };
    writeFileSync(a.config, `${JSON.stringify(cfg, null, 2)}\n`);
    if (a.skillDir && !exists(a.skillDir)) {
      mkdirSync(dirname(a.skillDir), { recursive: true });
      // Junctions need no admin rights on Windows.
      symlinkSync(ROOT, a.skillDir, process.platform === "win32" ? "junction" : "dir");
    }
  }
  o.say(o.dryRun ? "dry run: nothing changed" : "done — restart your agent so it loads the MCP server and skill");
  return 0;
}

function exists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}
