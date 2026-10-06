import { round6 } from "../checks/result";
import { footprint } from "../geometry";
import type { Scene } from "../types";
import { prepareRelations, type PreparedRelation } from "./prepare";
import { SATISFIED, type Rects } from "./shared";

export type RelationStatus = "satisfied" | "violated" | "skip";

/** Result shape of SPEC section 7. */
export interface RelationResult {
  readonly id: string;
  readonly rel: string;
  readonly hard: boolean;
  readonly status: RelationStatus;
  /** Rounded to 6 decimals; `null` when skipped. */
  readonly violation: number | null;
  /** Objects involved, in object order. */
  readonly ids: readonly string[];
  readonly message: string;
}

export interface RelationReport {
  readonly results: readonly RelationResult[];
  /** Sum of `weight * violation` over soft relations that are not skipped. */
  readonly softPenalty: number;
}

/** Footprints of every object, indexed like `scene.objects`. */
export function footprints(scene: Scene): Rects {
  return scene.objects.map((o) => footprint(scene, o));
}

/** The result of one prepared relation for the footprints `rects`. */
export function relationResult(scene: Scene, p: PreparedRelation, rects: Rects): RelationResult {
  const base = { id: p.relation.id, rel: p.relation.rel, hard: p.hard };
  const ids = p.objects.map((i) => scene.objects[i]?.id as string);
  const hard = p.hard ? "hard; " : "";
  if (p.measure === null) return { ...base, status: "skip", violation: null, ids, message: `${hard}${p.reason ?? ""}` };
  const violation = p.measure.violation(rects);
  const status = violation <= SATISFIED ? "satisfied" : "violated";
  const message = `${hard}${p.measure.message(rects)}`;
  return { ...base, status, violation: round6(violation) + 0, ids, message };
}

/** Soft penalty of prepared relations for the footprints `rects`, from the unrounded violations. */
export function softPenalty(prepared: readonly PreparedRelation[], rects: Rects): number {
  let sum = 0;
  for (const p of prepared) if (!p.hard && p.measure !== null) sum += p.weight * p.measure.violation(rects);
  return sum;
}

/** Measure every relation of the scene, in file order (SPEC section 7). */
export function evaluateRelations(scene: Scene): RelationReport {
  const prepared = prepareRelations(scene);
  const rects = footprints(scene);
  return {
    results: prepared.map((p) => relationResult(scene, p, rects)),
    softPenalty: softPenalty(prepared, rects),
  };
}
