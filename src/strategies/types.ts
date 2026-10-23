// Strategy plug-in contract. A strategy observes the target and records
// evidence + endpoint observations through the shared context. Adding a new
// investigation technique = adding one module to strategies/ and registering it
// in strategies/index.ts; nothing else needs to change.

import type { SafeHttp } from "../core/http.ts";
import type { EndpointInventory, EvidenceStore } from "../core/inventory.ts";
import type { ProgressLog } from "../core/progress.ts";
import type { Limits } from "../core/limits.ts";
import type { EmbeddedDataFinding, InvestigationInput, StrategyRun, TechFinding } from "../core/types.ts";
import type { HtmlAnalysis } from "../analysis/html.ts";

export interface InvestigationContext {
  input: InvestigationInput;
  limits: Limits;
  http: SafeHttp;
  evidence: EvidenceStore;
  inventory: EndpointInventory;
  log: ProgressLog;
  tech: TechFinding[];
  embedded: EmbeddedDataFinding[];
  limitations: string[];
  /** Filled by the html strategy; read by later strategies. */
  page?: { url: string; status: number; html: string; analysis: HtmlAnalysis; headers: Headers };
  /** Retained raw samples keyed by endpoint id (redacted JSON or text). */
  samples: Map<string, { body: unknown; linkHeader?: string | null; headers?: Record<string, string> }>;
  /** Writes a sample file under investigation/samples and returns its relative path. */
  saveSample(name: string, data: unknown): string;
  /** Origins the investigator may contact itself (target origin + explicit allow list). */
  allowedOrigins: Set<string>;
  /** Same-site API-like hosts found by passive sources (Certificate Transparency), read by api-hosts. */
  apiHosts?: string[];
  /** Set when the target answered with a bot challenge: only strategies that do not touch it keep running. */
  targetBlocked?: string;
  appType: string;
}

export interface Strategy {
  id: string;
  description: string;
  /** Optional precondition; return a reason string to skip. */
  skip?(ctx: InvestigationContext): Promise<string | undefined> | string | undefined;
  run(ctx: InvestigationContext): Promise<Omit<StrategyRun, "id" | "durationMs">>;
}
