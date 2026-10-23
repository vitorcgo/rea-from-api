// Cross-platform helpers (Linux, macOS, Windows): PATH lookup with PATHEXT,
// and running npm-installed Node CLIs through `node` instead of their
// `.bin` shims (which are `.cmd` files on Windows and cannot be execFile'd).

import { closeSync, existsSync, openSync, readSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export const IS_WINDOWS = process.platform === "win32";

export const home = () => homedir();

/** Finds the first existing executable among `names` on PATH (+ extra dirs). */
export function findOnPath(names: string[], extraDirs: string[] = []): string | undefined {
  const exts = IS_WINDOWS ? ["", ...(process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").map((e) => e.toLowerCase())] : [""];
  for (const dir of [...(process.env.PATH ?? "").split(delimiter), ...extraDirs]) {
    if (!dir) continue;
    for (const n of names)
      for (const ext of exts) {
        const p = join(dir, n + ext);
        if (existsSync(p)) return p;
      }
  }
  return undefined;
}

/**
 * How to execute `bin`: JavaScript entry points run through the current Node
 * binary; Windows .cmd/.bat shims run through cmd.exe; everything else directly.
 */
export function commandFor(bin: string): { cmd: string; pre: string[] } {
  if (/\.(mjs|cjs|js)$/i.test(bin) || hasNodeShebang(bin)) return { cmd: process.execPath, pre: [bin] };
  if (IS_WINDOWS && /\.(cmd|bat)$/i.test(bin)) return { cmd: process.env.ComSpec ?? "cmd.exe", pre: ["/d", "/s", "/c", bin] };
  return { cmd: bin, pre: [] };
}

/** Extension-less npm entry scripts (e.g. typescript/bin/tsc) start with a node shebang. */
function hasNodeShebang(file: string): boolean {
  if (/\.(exe|cmd|bat|ps1)$/i.test(file) || !existsSync(file)) return false;
  try {
    const fd = openSync(file, "r");
    const buf = Buffer.alloc(64);
    readSync(fd, buf, 0, 64, 0);
    closeSync(fd);
    return /^#!.*\bnode\b/.test(buf.toString("utf8"));
  } catch {
    return false;
  }
}
