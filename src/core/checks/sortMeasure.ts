import type { Box, Rect } from "../geometry";
import { actorWorst, prepareActor, type PreparedSprite } from "../sort/mismatch";
import { actorOrderWorst, actorSlot } from "../sort/orderRule";
import { sortKey } from "../sort/sprites";
import type { Scene, SortConsistencyCheck, Vec3 } from "../types";
import { actorCounts, noteActor, type Allowance } from "./sortAllow";
import type { ActorSearch } from "./sortPositions";

/** One pass of `sort_consistency` after the sprites and the static areas are known. */
export interface SortPass {
  readonly scene: Scene;
  readonly spec: SortConsistencyCheck;
  readonly examined: readonly number[];
  readonly footprints: readonly Rect[];
  readonly prepared: readonly (readonly PreparedSprite[])[];
  readonly drawn: readonly PreparedSprite[];
  readonly c: Vec3;
  readonly rule: "key" | "order";
  /** Static worst area of every object, already without the mismatches `allow` drops. */
  readonly base: readonly number[];
  readonly allowance: Allowance | null;
  readonly maxPixels: number;
  readonly obstacles: readonly Box[];
  readonly step: number;
  readonly reach: number;
  /** The grid search. Absent when positions come from `lanes`. */
  readonly search: ActorSearch | null;
}

/** The positions used, and each examined object's worst area after the actor mismatches. */
export interface PositionRank {
  readonly worst: readonly number[];
  readonly positions: number;
}

/** Wrong area of one actor placement against the sprites of object `index` (SPEC 9.3, 9.9). */
export function actorArea(pass: SortPass, index: number, foot: Rect, level: number): number {
  const box: Box = { ...foot, h0: level, h1: level + pass.spec.actor[2] };
  const actor = prepareActor(box, sortKey(pass.c, foot, level), pass.scene.camera, pass.c);
  const own = pass.prepared[index] as readonly PreparedSprite[];
  return pass.rule === "order" ? actorOrderWorst(own, actor, actorSlot(pass.drawn, actor, pass.c), pass.c) : actorWorst(own, actor, pass.c);
}

/** Fold one used position's actor mismatch into `worst` when the object is not allowed. */
export function recordActor(pass: SortPass, index: number, slot: number, worst: number[], foot: Rect, level: number): void {
  const id = (pass.scene.objects[index] as { id: string }).id;
  const area = actorArea(pass, index, foot, level);
  noteActor(pass.allowance, id, area, pass.maxPixels);
  if (actorCounts(pass.allowance, id)) worst[slot] = Math.max(worst[slot] as number, area);
}
