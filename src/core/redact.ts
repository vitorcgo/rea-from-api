// Redaction helpers. Nothing that looks like a credential may reach
// reports, logs, diagrams, fixtures or generated code.

const SENSITIVE_NAME =
  /(^|[_\-.])(auth|authorization|token|access[_-]?token|id[_-]?token|refresh[_-]?token|api[_-]?key|apikey|key|secret|password|passwd|pwd|session|sessionid|sid|cookie|csrf|xsrf|signature|sig|jwt|bearer|credential|otp|code_verifier)($|[_\-.])/i;

const SENSITIVE_HEADER = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "x-csrf-token",
  "x-xsrf-token",
  "x-amz-security-token",
]);

export const REDACTED = "[REDACTED]";

/** Exact secret values (e.g. the user's API key) scrubbed from every artifact. */
const SECRET_VALUES = new Set<string>();
export function registerSecret(value: string | undefined): void {
  if (value && value.length >= 4) SECRET_VALUES.add(value);
}
function scrubSecrets(text: string): string {
  let out = text;
  for (const v of SECRET_VALUES) {
    out = out.split(v).join(REDACTED);
    const enc = encodeURIComponent(v);
    if (enc !== v) out = out.split(enc).join(REDACTED);
  }
  return out;
}

export function isSensitiveName(name: string): boolean {
  return SENSITIVE_NAME.test(name) || SENSITIVE_HEADER.has(name.toLowerCase());
}

export function isSensitiveHeader(name: string): boolean {
  const n = name.toLowerCase();
  return SENSITIVE_HEADER.has(n) || SENSITIVE_NAME.test(n);
}

/** Redacts sensitive query values and any userinfo from a URL string. */
export function redactUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  u.username = "";
  u.password = "";
  for (const [key, value] of [...u.searchParams.entries()]) {
    if (isSensitiveName(key) || SECRET_VALUES.has(value)) u.searchParams.set(key, REDACTED);
  }
  return scrubSecrets(u.toString());
}

const INLINE_SECRET_PATTERNS: RegExp[] = [
  /\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]+=*/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, // JWT
  /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /("?(?:password|passwd|secret|token|api_?key|access_?token|refresh_?token|session(?:id)?)"?\s*[:=]\s*)"[^"]*"/gi,
];

/** Best-effort scrub of free text (excerpts, error messages). */
export function redactText(text: string): string {
  let out = scrubSecrets(text);
  for (const re of INLINE_SECRET_PATTERNS) {
    out = out.replace(re, (m, p1: string | undefined) =>
      typeof p1 === "string" && /[:=]\s*$/.test(p1) ? `${p1}"${REDACTED}"` : REDACTED,
    );
  }
  return out;
}

/** Recursively replaces values of sensitive-looking keys inside JSON data. */
export function redactJson(value: unknown, depth = 0): unknown {
  if (depth > 40) return value;
  if (Array.isArray(value)) return value.map((v) => redactJson(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // Only string values can carry a credential; booleans/numbers keep their type so
      // samples still validate against the inferred schema.
      out[k] = isSensitiveName(k) && typeof v === "string" ? REDACTED : redactJson(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return redactText(value);
  return value;
}

/** Header names only — values are never persisted. */
export function headerNames(headers: Headers | Record<string, string>): string[] {
  const names = headers instanceof Headers ? [...headers.keys()] : Object.keys(headers);
  return [...new Set(names.map((n) => n.toLowerCase()))].sort();
}

export function truncate(text: string, max = 600): string {
  return text.length <= max ? text : `${text.slice(0, max)}… [${text.length - max} more chars]`;
}
