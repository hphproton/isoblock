import type { CheckResult, CheckStatus } from "../types";

/** A check whose status changed, or whose value changed by more than 1e-9, across a patch. */
export interface CheckChange {
  readonly id: string;
  readonly check: string;
  readonly from: CheckStatus;
  readonly to: CheckStatus;
  readonly value: readonly [number | null, number | null];
}

function valueChanged(a: number | null, b: number | null): boolean {
  return a === null || b === null ? a !== b : Math.abs(a - b) > 1e-9;
}

/**
 * The checks that changed from `before` to `after`, in the order of `after`. Checks are matched
 * by id; a check that only one side has shows in the `diff` of the patch, not here.
 */
export function checkChanges(before: readonly CheckResult[], after: readonly CheckResult[]): readonly CheckChange[] {
  const old = new Map(before.map((r) => [r.id, r]));
  const out: CheckChange[] = [];
  for (const now of after) {
    const was = old.get(now.id);
    if (was === undefined) continue;
    if (was.status === now.status && !valueChanged(was.value, now.value)) continue;
    out.push({ id: now.id, check: now.check, from: was.status, to: now.status, value: [was.value, now.value] });
  }
  return out;
}

/** Number of results that are `fail` or `skip`: what makes `check` and `patch` exit 1. */
export function failingCount(results: readonly CheckResult[]): number {
  return results.filter((r) => r.status === "fail" || r.status === "skip").length;
}
