import { EPS } from "../geometry";

/**
 * Status of a result that would pass, once an optional margin on the passing side of `bound`
 * is applied (SPEC 9.7). `warn` of 0, or no `warn`, leaves a pass as a pass.
 */
export function marginStatus(
  passing: boolean,
  value: number,
  bound: number,
  warn: number | undefined,
  side: "lower" | "upper",
): "pass" | "fail" | "warn" {
  if (!passing) return "fail";
  if (warn === undefined || warn <= 0) return "pass";
  const close = side === "lower" ? value < bound + warn - EPS : value > bound - warn + EPS;
  return close ? "warn" : "pass";
}
