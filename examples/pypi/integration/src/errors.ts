export class IntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class HttpError extends IntegrationError {
  readonly status: number;
  readonly url: string;
  readonly retryable: boolean;
  constructor(status: number, url: string, retryable: boolean) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
    this.url = url;
    this.retryable = retryable;
  }
}

export class TimeoutError extends IntegrationError {}

/** The response no longer matches the shape observed during investigation (format drift). */
export class ValidationError extends IntegrationError {
  readonly path: string;
  constructor(path: string, expected: string, got: unknown) {
    super(`Response validation failed at ${path}: expected ${expected}, got ${describe(got)}`);
    this.path = path;
  }
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

export function fail(path: string, expected: string, got: unknown): never {
  throw new ValidationError(path, expected, got);
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
