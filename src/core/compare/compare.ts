import { runChecks } from "../checks";
import { round6 } from "../checks/result";
import { EPS } from "../geometry";
import type { CheckResult, CheckSpec, CheckStatus, Scene } from "../types";
import { failingCount } from "../patch/changes";
import { applyVariant } from "./variant";
import { checkLabel } from "./labels";

/** The state `compare` runs at until stage 6 adds states. */
export const DEFAULT_STATE = "default";

export interface VariantInput {
  readonly name: string;
  readonly text: string;
}

export interface CompareCheck {
  readonly id: string;
  readonly check: string;
  readonly label: string;
  readonly threshold: CheckResult["threshold"];
  /** One entry per column, base first. */
  readonly values: readonly (number | null)[];
  readonly status: readonly CheckStatus[];
  /** Value minus the base value, 6 decimals; `null` for the base and for values that are not numbers. */
  readonly delta: readonly (number | null)[];
}

export interface Moved {
  readonly count: number;
  readonly distance: number;
}

/** The measures of the base scene and its variants (SPEC section 11.1). Every list has one entry per column, base first. */
export interface Comparison {
  readonly scene: string;
  readonly state: string;
  readonly unit: string;
  readonly variants: readonly { readonly name: string; readonly label: string | null }[];
  readonly failing: readonly number[];
  readonly locksTouched: readonly (readonly string[])[];
  readonly moved: readonly (Moved | null)[];
  readonly checks: readonly CompareCheck[];
}

function movedOf(base: Scene, scene: Scene): Moved {
  const now = new Map(scene.objects.map((o) => [o.id, o]));
  let count = 0;
  let distance = 0;
  for (const o of base.objects) {
    const next = now.get(o.id);
    if (next === undefined) continue;
    const d = Math.hypot(next.pos[0] - o.pos[0], next.pos[1] - o.pos[1]);
    if (d > EPS) {
      count++;
      distance += d;
    }
  }
  return { count, distance: round6(distance) };
}

function deltaOf(value: number | null, base: number | null): number | null {
  if (value === null || base === null) return null;
  const d = round6(value - base);
  return d === 0 ? 0 : d;
}

function rowOf(spec: CheckSpec, unit: string, columns: readonly (readonly CheckResult[])[], index: number): CompareCheck {
  const results = columns.map((c) => c[index] as CheckResult);
  const base = results[0] as CheckResult;
  return {
    id: spec.id,
    check: spec.check,
    label: checkLabel(spec, base, unit),
    threshold: base.threshold,
    values: results.map((r) => r.value),
    status: results.map((r) => r.status),
    delta: results.map((r, i) => (i === 0 ? null : deltaOf(r.value, base.value))),
  };
}

/**
 * Apply each variant to a copy of the base scene, run the base scene's checks on every result and
 * measure (SPEC section 11.1). Locks are ignored but recorded. Throws like `applyVariant`.
 */
export function compareVariants(base: Scene, variants: readonly VariantInput[]): Comparison {
  const applied = variants.map((v) => ({ name: v.name, ...applyVariant(base, v.name, v.text) }));
  const columns = [runChecks(base), ...applied.map((a) => runChecks(a.scene))];
  return {
    scene: base.id,
    state: DEFAULT_STATE,
    unit: base.units.name,
    variants: [{ name: "base", label: null }, ...applied.map((a) => ({ name: a.name, label: a.description ?? a.name }))],
    failing: columns.map(failingCount),
    locksTouched: [[], ...applied.map((a) => a.locks)],
    moved: [null, ...applied.map((a) => movedOf(base, a.scene))],
    checks: (base.checks ?? []).map((spec, i) => rowOf(spec, base.units.name, columns, i)),
  };
}
