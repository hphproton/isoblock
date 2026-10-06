export type ErrorCode =
  | "E_IO"
  | "E_JSON_PARSE"
  | "E_SCHEMA"
  | "E_REF"
  | "E_PATCH"
  | "E_LOCK"
  | "E_USAGE"
  | "E_INTERNAL";

/** Error with a stable code. `details` holds one line per individual problem. */
export class IsoblockError extends Error {
  readonly code: ErrorCode;
  readonly details: readonly string[];

  constructor(code: ErrorCode, message: string, details: readonly string[] = []) {
    super(message);
    this.name = "IsoblockError";
    this.code = code;
    this.details = details;
  }
}

/** The same error with `prefix: ` in front of its message (for example `line 3`). */
export function withPrefix(error: IsoblockError, prefix: string): IsoblockError {
  return new IsoblockError(error.code, `${prefix}: ${error.message}`, error.details);
}

/** Process exit code for an error code (SPEC section 11). */
export function exitCodeFor(code: ErrorCode): number {
  if (code === "E_INTERNAL") return 70;
  return code === "E_LOCK" ? 3 : 2;
}
