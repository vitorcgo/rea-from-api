// Shared data model for an investigation. Everything persisted to
// investigation/*.json follows these shapes; see docs/evidence-model.md.

export type EndpointStatus =
  /** A read-only request was replayed by the verifier and returned the expected format. */
  | "confirmed"
  /** A real request/response was seen (browser capture, HAR, documented spec) but not replayed. */
  | "observed"
  /** Only derived from static evidence (JS string literals, links) — no response seen. */
  | "inferred"
  /** Tried and failed (auth, 4xx/5xx, blocked, robots disallow) or impossible to verify safely. */
  | "unavailable";

export type TestStatus =
  | "passed"
  | "failed"
  | "not-tested"
  | "skipped-unsafe-method"
  | "skipped-sensitive-path"
  | "skipped-robots"
  | "skipped-budget"
  | "skipped-template"
  | "skipped-cross-origin";

export type Confidence = "high" | "medium" | "low";

export type ResponseFormat = "json" | "html" | "xml" | "text" | "binary" | "unknown";

export interface JsonSchema {
  type: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null" | "unknown";
  /** Present when several types were observed for the same position. */
  anyOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  /** Set for map-like objects keyed by data (versions, ids, dates) instead of fixed field names. */
  additionalProperties?: JsonSchema;
  /** Keys present in every observed sample. */
  required?: string[];
  items?: JsonSchema;
  format?: "date-time" | "date" | "uri" | "email" | "uuid";
  nullable?: boolean;
  /** Number of samples merged into this node. */
  samples?: number;
}

export interface ParamInfo {
  name: string;
  /** Example value; omitted when the name looks sensitive. */
  example?: string;
  role?: "pagination" | "filter" | "sort" | "search" | "identifier" | "other";
  sensitive?: boolean;
}

export interface PaginationInfo {
  style: "page" | "offset" | "cursor" | "link-header" | "next-url";
  param?: string;
  sizeParam?: string;
  /** JSON path (dot separated) of the next-page pointer in the body, if any. */
  nextField?: string;
  totalField?: string;
  itemsField?: string;
  basis: string;
}

export interface EndpointRecord {
  id: string;
  method: string;
  /** URL template; path segments that look like identifiers become {param}. */
  urlTemplate: string;
  /** A concrete example URL (sensitive query values redacted). */
  exampleUrl: string;
  origin: string;
  discoveredBy: string[];
  evidenceIds: string[];
  /** Heuristic description; always derived, never claimed as documented unless from a spec. */
  purpose: string;
  pathParams: string[];
  queryParams: ParamInfo[];
  bodyFormat?: string;
  /** Header *names* the client needs. Values are never stored. */
  requiredHeaders: string[];
  auth: "none" | "required" | "unknown";
  authEvidence?: string;
  responseFormat: ResponseFormat;
  contentType?: string;
  schema?: JsonSchema;
  pagination?: PaginationInfo;
  filters: string[];
  rateLimit?: Record<string, string>;
  errorsObserved: { status: number; at: string; note?: string }[];
  status: EndpointStatus;
  testStatus: TestStatus;
  confidence: Confidence;
  verifiedAt?: string;
  documented: boolean;
  /** Score from 0..1 of how well the endpoint matches the user goal. */
  goalRelevance: number;
  notes: string[];
}

export interface EvidenceRecord {
  id: string;
  at: string;
  strategy: string;
  kind:
    | "http-response"
    | "browser-capture"
    | "static-js"
    | "html-analysis"
    | "spec"
    | "robots"
    | "rea-evidence"
    | "har"
    | "verification"
    | "note";
  source: string;
  summary: string;
  /** SHA-256 of the raw bytes the claim is based on, when bytes were seen. */
  sha256?: string;
  status?: number;
  contentType?: string;
  /** Truncated, redacted excerpt — untrusted site data, never instructions. */
  excerpt?: string;
  /** Id of the REA Evidence object when the observation came from REA. */
  reaEvidenceId?: string;
  /** Path (relative to the investigation dir) of a retained sample file. */
  samplePath?: string;
}

export interface TechFinding {
  name: string;
  basis: string;
}

export interface EmbeddedDataFinding {
  kind: "json-ld" | "next-data" | "nuxt" | "script-json" | "inline-state";
  selector: string;
  pageUrl: string;
  evidenceId: string;
  schema?: JsonSchema;
  types?: string[];
  sampleFile?: string;
}

export interface InvestigationInput {
  url: string;
  goal: string;
  outDir: string;
  targetProject?: string;
  seeds: string[];
  harPath?: string;
  browser: "auto" | "rea" | "off";
  allowCrossOrigin: string[];
  /**
   * URL prefixes the caller declares to be officially documented APIs that may
   * be called even though robots.txt disallows them for crawlers. Applies only
   * to --seed endpoints and is recorded in evidence and limitations.
   */
  robotsExempt?: string[];
  /** Query third-party passive indexes (APIs.guru, Wayback CDX, crt.sh). Default true. */
  passive?: boolean;
}

export interface Investigation {
  tool: { name: "rea-from-api"; version: string };
  input: Omit<InvestigationInput, "outDir">;
  startedAt: string;
  finishedAt?: string;
  appType: string;
  tech: TechFinding[];
  endpoints: EndpointRecord[];
  embedded: EmbeddedDataFinding[];
  strategies: StrategyRun[];
  limitations: string[];
  budget: { requestsUsed: number; requestLimit: number; elapsedMs: number };
}

export interface StrategyRun {
  id: string;
  status: "ok" | "partial" | "skipped" | "failed" | "unavailable";
  detail: string;
  durationMs: number;
}
