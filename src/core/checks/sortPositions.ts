import { EPS, rectGap, rectsOverlap, type Rect } from "../geometry";
import { insidePolygon } from "../polygon";
import type { Vec2, Vec3 } from "../types";

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
  /** The footprints of all objects of the scene: an actor does not stand on any of them. */
  readonly obstacles: readonly Rect[];
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
      if (blocking.some((o) => rectsOverlap(actor, o))) continue;
      if (onGround(search.ground, u, v)) visit(actor);
    }
  }
}
