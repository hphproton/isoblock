import { boxesOverlap, EPS, rectGap, sizeBox, worldParts, type Box, type Rect } from "../geometry";
import { insidePolygon } from "../polygon";
import type { Scene, Vec2, Vec3 } from "../types";

/** The ground an actor may stand on: the zone `area` (when given) minus the blocked zones. */
export interface ActorGround {
  readonly area: readonly Vec2[] | null;
  readonly blocked: readonly (readonly Vec2[])[];
}

export interface ActorSearch {
  readonly actor: Vec3;
  readonly step: number;
  readonly reach: number;
  readonly ground: ActorGround;
  /** Height the actor stands on (SPEC 9.5). */
  readonly level: number;
  /** Object boxes, or drawn part boxes when `parts` is set: an actor overlaps none of them. */
  readonly obstacles: readonly Box[];
}

/** Boxes that refuse an actor position: size boxes, or drawn part boxes when `parts` is set (SPEC 9.10). */
export function obstacleBoxes(scene: Scene, parts: boolean): readonly Box[] {
  if (!parts) return scene.objects.map((object) => sizeBox(scene, object));
  return scene.objects.flatMap((object) => worldParts(scene, object).map((part) => part.box));
}

/** Grid cells of the search around a footprint; a larger search is not run (use a larger `step`). */
export function searchCells(target: Rect, search: ActorSearch): number {
  const [w, d] = search.actor;
  const { reach, step } = search;
  return ((target.u1 - target.u0 + 2 * reach + w) * (target.v1 - target.v0 + 2 * reach + d)) / (step * step);
}

function onGround(ground: ActorGround, u: number, v: number): boolean {
  if (ground.area !== null && !insidePolygon(ground.area, u, v)) return false;
  return !ground.blocked.some((points) => insidePolygon(points, u, v));
}

/**
 * Calls `visit` with the footprint of the actor at every position used for `target` (SPEC 9.3): the
 * cell centers ((i + 0.5) step, (j + 0.5) step) where the actor is within `reach` of the target,
 * overlaps no object, and stands on the ground. Rows run along u first, then v.
 */
export function eachActorPosition(target: Rect, search: ActorSearch, visit: (actor: Rect) => void): void {
  const [w, d] = search.actor;
  const { step, reach } = search;
  const near = { u0: target.u0 - reach - EPS, v0: target.v0 - reach - EPS, u1: target.u1 + reach + EPS, v1: target.v1 + reach + EPS };
  // The actor lies within `reach` of the target and has its own size, so it stays inside `near` grown by that size.
  const room = { u0: near.u0 - w, v0: near.v0 - d, u1: near.u1 + w, v1: near.v1 + d };
  const blocking = search.obstacles.filter((o) => rectGap(o, room) <= EPS);
  const h0 = search.level;
  const h1 = h0 + search.actor[2];
  const range = (lo: number, hi: number, size: number): [number, number] => [
    Math.floor((lo - size / 2) / step - 0.5) - 1,
    Math.ceil((hi + size / 2) / step - 0.5) + 1,
  ];
  const [i0, i1] = range(near.u0, near.u1, w);
  const [j0, j1] = range(near.v0, near.v1, d);
  for (let i = i0; i <= i1; i++) {
    const u = (i + 0.5) * step;
    for (let j = j0; j <= j1; j++) {
      const v = (j + 0.5) * step;
      const actor: Rect = { u0: u - w / 2, v0: v - d / 2, u1: u + w / 2, v1: v + d / 2 };
      if (rectGap(actor, target) > reach + EPS) continue;
      if (blocking.some((o) => boxesOverlap({ ...actor, h0, h1 }, o))) continue;
      if (onGround(search.ground, u, v)) visit(actor);
    }
  }
}

/** True when `value` is within EPS of a cell center `(i + 0.5) * step`. */
function onCellCenter(value: number, step: number): boolean {
  const k = value / step - 0.5;
  return Math.abs(k - Math.round(k)) * step <= EPS;
}

/** `lo + k * step` while it stays at most `hi`, then `hi` unless it repeats one of those. */
function samples(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  const push = (t: number): void => {
    if (out.every((have) => Math.abs(have - t) > EPS)) out.push(t);
  };
  for (let k = 0; lo + k * step <= hi + EPS; k++) push(lo + k * step);
  push(hi);
  return out;
}

/**
 * Contact positions of 9.10: the actor footprint touches a side of `target` from outside.
 * A contact that is already a grid point of 9.3 is skipped, so it is counted once.
 */
export function eachContactPosition(target: Rect, search: ActorSearch, visit: (actor: Rect) => void): void {
  const [w, d] = search.actor;
  const { step, reach } = search;
  const { u0, v0, u1, v1 } = target;
  const h0 = search.level;
  const h1 = h0 + search.actor[2];
  const consider = (u: number, v: number): void => {
    if (onCellCenter(u, step) && onCellCenter(v, step)) return;
    const actor: Rect = { u0: u - w / 2, v0: v - d / 2, u1: u + w / 2, v1: v + d / 2 };
    if (rectGap(actor, target) > reach + EPS) return;
    if (search.obstacles.some((o) => boxesOverlap({ ...actor, h0, h1 }, o))) return;
    if (onGround(search.ground, u, v)) visit(actor);
  };
  for (const t of samples(v0, v1, step)) {
    consider(u0 - w / 2, t);
    consider(u1 + w / 2, t);
  }
  for (const t of samples(u0, u1, step)) {
    consider(t, v0 - d / 2);
    consider(t, v1 + d / 2);
  }
}
