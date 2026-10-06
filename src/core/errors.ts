export type ErrorCode =
  | "E_IO"
  | "E_JSON_PARSE"
  | "E_SCHEMA"
  | "E_REF"
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

/** Process exit code for an error code (SPEC section 11). */
export function exitCodeFor(code: ErrorCode): number {
  return code === "E_INTERNAL" ? 70 : 2;
}
