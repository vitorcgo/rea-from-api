// `rea-from-api setup`: registers the MCP server and installs the skill for the
// agents you choose (REA's `npx rea-agents setup` model). It detects installed
// agents, shows the plan, asks before changing anything (unless --yes), backs up
// every file it edits, and `--uninstall` reverses it.

import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync, copyFileSync, realpathSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IS_WINDOWS, home } from "./core/platform.ts";
import { VERSION } from "./version.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LAUNCHER = join(ROOT, "bin", "rea-from-api.mjs");
const NAME = "rea-from-api";

type ConfigFormat = "mcpServers" | "vscode" | "codex-toml";

export interface AgentTarget {
  id: string;
  label: string;
  config: string;
  format: ConfigFormat;
  /** Directory whose existence means the agent is installed. */
  detect: string;
  skillDir?: string;
}

function appData(...p: string[]): string {
  if (IS_WINDOWS) return join(process.env.APPDATA ?? join(home(), "AppData", "Roaming"), ...p);
  if (process.platform === "darwin") return join(home(), "Library", "Application Support", ...p);
  return join(process.env.XDG_CONFIG_HOME ?? join(home(), ".config"), ...p);
}

export function agents(cwd = process.cwd()): AgentTarget[] {
  const h = home();
  return [
    { id: "claude-code", label: "Claude Code", config: join(h, ".claude.json"), format: "mcpServers", detect: join(h, ".claude"), skillDir: join(h, ".claude", "skills", NAME) },
    { id: "claude-desktop", label: "Claude Desktop", config: appData("Claude", "claude_desktop_config.json"), format: "mcpServers", detect: appData("Claude") },
    { id: "codex", label: "Codex", config: join(h, ".codex", "config.toml"), format: "codex-toml", detect: join(h, ".codex") },
    { id: "cursor", label: "Cursor", config: join(h, ".cursor", "mcp.json"), format: "mcpServers", detect: join(h, ".cursor") },
    { id: "vscode", label: "VS Code (Copilot)", config: appData("Code", "User", "mcp.json"), format: "vscode", detect: appData("Code", "User") },
    { id: "windsurf", label: "Windsurf", config: join(h, ".codeium", "windsurf", "mcp_config.json"), format: "mcpServers", detect: join(h, ".codeium", "windsurf") },
    { id: "gemini", label: "Gemini CLI", config: join(h, ".gemini", "settings.json"), format: "mcpServers", detect: join(h, ".gemini") },
    { id: "project", label: "This project (.mcp.json + .claude/skills)", config: join(cwd, ".mcp.json"), format: "mcpServers", detect: cwd, skillDir: join(cwd, ".claude", "skills", NAME) },
  ];
}

/** Installed from an ephemeral npx cache? Then register `npx rea-from-api` instead of a path that will disappear. */
export function isEphemeralInstall(root = ROOT): boolean {
  return /[\\/]_npx[\\/]/.test(root);
}

export function mcpEntry(root = ROOT): { command: string; args: string[] } {
  if (isEphemeralInstall(root)) {
    const args = ["-y", `${NAME}@${VERSION}`, "mcp"];
    // MCP clients spawn without a shell; npx is a .cmd shim on Windows.
    return IS_WINDOWS ? { command: "cmd", args: ["/c", "npx", ...args] } : { command: "npx", args };
  }
  return { command: process.execPath, args: [join(root, "bin", "rea-from-api.mjs"), "mcp"] };
}

export interface SetupOptions {
  agents?: string[];
  all?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  uninstall?: boolean;
  say: (s: string) => void;
  cwd?: string;
}

export async function setup(o: SetupOptions): Promise<number> {
  const all = agents(o.cwd);
  const detected = all.filter((a) => a.id !== "project" && existsSync(a.detect));
  let chosen: AgentTarget[];
  if (o.agents?.length) {
    const unknown = o.agents.filter((id) => !all.some((a) => a.id === id));
    if (unknown.length) {
      o.say(`unknown agent(s): ${unknown.join(", ")}. Choose from: ${all.map((a) => a.id).join(", ")}`);
      return 1;
    }
    chosen = all.filter((a) => o.agents!.includes(a.id));
  } else if (o.all) chosen = detected;
  else {
    o.say(`Detected agents: ${detected.length ? detected.map((a) => `${a.label} (${a.id})`).join(", ") : "none"}`);
    if (!detected.length || !process.stdin.isTTY) {
      o.say(`Choose with --agent <id> (repeatable) or --all. Available: ${all.map((a) => a.id).join(", ")}`);
      return detected.length ? 1 : 0;
    }
    chosen = detected;
  }

  const entry = mcpEntry();
  o.say(o.uninstall ? "Plan (uninstall):" : `Plan (MCP command: ${[entry.command, ...entry.args].join(" ")}):`);
  for (const a of chosen) {
    o.say(`  ${a.label}: ${o.uninstall ? "remove" : "add"} MCP server "${NAME}" in ${a.config}`);
    if (a.skillDir) o.say(`  ${a.label}: ${o.uninstall ? "remove" : "install"} skill at ${a.skillDir}`);
  }
  if (o.dryRun) {
    o.say("dry run: nothing changed");
    return 0;
  }
  if (!o.yes && process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question("Apply these changes? [Y/n] ")).trim().toLowerCase();
    rl.close();
    if (answer && answer !== "y" && answer !== "yes" && answer !== "s" && answer !== "sim") {
      o.say("cancelled: nothing changed");
      return 0;
    }
  }

  for (const a of chosen) {
    if (o.uninstall) {
      removeServer(a);
      if (a.skillDir) removeSkill(a.skillDir);
    } else {
      writeServer(a, entry);
      if (a.skillDir) installSkill(a.skillDir);
    }
  }
  o.say(o.uninstall ? "removed; restart your agents" : "done; restart your agents so they load the MCP server and skill");
  return 0;
}

// ---- config writers ------------------------------------------------------------

function backup(file: string): void {
  if (existsSync(file)) copyFileSync(file, `${file}.bak-${NAME}`);
}

function readJson(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {};
  const text = readFileSync(file, "utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`${file} is not valid JSON; fix it or remove it and run setup again (nothing was changed)`);
  }
}

function writeJson(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function writeServer(a: AgentTarget, entry: { command: string; args: string[] }): void {
  if (a.format === "codex-toml") {
    const text = existsSync(a.config) ? readFileSync(a.config, "utf8") : "";
    const block = `[mcp_servers.${NAME}]\ncommand = ${JSON.stringify(entry.command)}\nargs = [${entry.args.map((x) => JSON.stringify(x)).join(", ")}]\nstartup_timeout_sec = 30\n`;
    backup(a.config);
    mkdirSync(dirname(a.config), { recursive: true });
    const stripped = stripTomlTable(text, `mcp_servers.${NAME}`).trimEnd();
    writeFileSync(a.config, `${stripped ? `${stripped}\n\n` : ""}${block}`);
    return;
  }
  const cfg = readJson(a.config);
  backup(a.config);
  if (a.format === "vscode") cfg.servers = { ...((cfg.servers as object) ?? {}), [NAME]: { type: "stdio", ...entry } };
  else cfg.mcpServers = { ...((cfg.mcpServers as object) ?? {}), [NAME]: { type: "stdio", ...entry } };
  writeJson(a.config, cfg);
}

function removeServer(a: AgentTarget): void {
  if (!existsSync(a.config)) return;
  if (a.format === "codex-toml") {
    backup(a.config);
    writeFileSync(a.config, `${stripTomlTable(readFileSync(a.config, "utf8"), `mcp_servers.${NAME}`).trimEnd()}\n`);
    return;
  }
  const cfg = readJson(a.config);
  const key = a.format === "vscode" ? "servers" : "mcpServers";
  const servers = cfg[key] as Record<string, unknown> | undefined;
  if (!servers?.[NAME]) return;
  backup(a.config);
  delete servers[NAME];
  writeJson(a.config, cfg);
}

/** Removes a `[table]` (and its sub-tables) from TOML text without touching anything else. */
export function stripTomlTable(text: string, table: string): string {
  const out: string[] = [];
  let skipping = false;
  for (const line of text.split(/\r?\n/)) {
    const header = /^\s*\[{1,2}\s*([^\]]+?)\s*\]{1,2}\s*(#.*)?$/.exec(line)?.[1];
    if (header !== undefined) skipping = header === table || header.startsWith(`${table}.`);
    if (!skipping) out.push(line);
  }
  return out.join("\n");
}

// ---- skill --------------------------------------------------------------------

function isGitCheckout(): boolean {
  return existsSync(join(ROOT, ".git")) && existsSync(join(ROOT, "src"));
}

function installSkill(dir: string): void {
  if (exists(dir)) {
    if (!isOurs(dir)) throw new Error(`${dir} exists and is not a rea-from-api skill; remove it first`);
    removeSkill(dir);
  }
  mkdirSync(dirname(dir), { recursive: true });
  if (isGitCheckout()) {
    // Live link to the checkout. Junctions need no admin rights on Windows.
    symlinkSync(ROOT, dir, IS_WINDOWS ? "junction" : "dir");
    return;
  }
  // npm/npx install: copy the instructions (an npx cache can disappear).
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(ROOT, "SKILL.md"), join(dir, "SKILL.md"));
  if (existsSync(join(ROOT, "docs"))) cpSync(join(ROOT, "docs"), join(dir, "docs"), { recursive: true });
}

function removeSkill(dir: string): void {
  if (!exists(dir) || !isOurs(dir)) return;
  const st = lstatSync(dir);
  // Removing a link/junction must not delete the checkout it points to.
  if (st.isSymbolicLink() || isJunction(dir)) rmSync(dir, { force: true, recursive: false });
  else rmSync(dir, { recursive: true, force: true });
}

function isOurs(dir: string): boolean {
  try {
    return /^name:\s*rea-from-api\s*$/m.test(readFileSync(join(dir, "SKILL.md"), "utf8"));
  } catch {
    return false;
  }
}

function isJunction(dir: string): boolean {
  try {
    readlinkSync(dir);
    return true;
  } catch {
    return IS_WINDOWS && realpathSync(dir) !== resolve(dir);
  }
}

function exists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}
