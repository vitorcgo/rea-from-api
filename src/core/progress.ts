// Append-only JSONL progress log (investigation/progress.jsonl) plus
// optional human-readable echo on stderr.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class ProgressLog {
  private file: string | undefined;
  private echo: boolean;

  constructor(file: string | undefined, echo = false) {
    this.file = file;
    this.echo = echo;
    if (file) mkdirSync(dirname(file), { recursive: true });
  }

  event(kind: string, data: Record<string, unknown> = {}): void {
    const line = { at: new Date().toISOString(), kind, ...data };
    if (this.file) appendFileSync(this.file, `${JSON.stringify(line)}\n`);
    if (this.echo && kind !== "http") process.stderr.write(`[rea-from-api] ${kind} ${summarize(data)}\n`);
  }
}

function summarize(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ")
    .slice(0, 300);
}
