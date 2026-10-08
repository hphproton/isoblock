import { partOrders } from "../export/partOrder";
import { EPS, footprint, worldParts, type Box, type Rect } from "../geometry";
import { orderDirection } from "../projection";
import { round } from "../round";
import type { Scene, Vec3 } from "../types";

/** The most slices one object is cut into (SPEC 13.4). */
export const MAX_SLICES = 64;

const DECIMALS = 6;

/** The part of a part box that one sprite draws. */
export interface Piece {
  readonly part: string;
  readonly box: Box;
}

/** What an engine draws and sorts as one item (SPEC 13.4): a sort key, a footprint and the pieces to draw. */
export interface Sprite {
  readonly key: number;
  readonly footprint: Rect;
  readonly pieces: readonly Piece[];
}

/** A part of an object in world units, with its position in the painter's order. */
export interface OrderedPart {
  readonly id: string;
  readonly box: Box;
  readonly order: number;
}

/** The sort key of a footprint: twice the ground depth of its center, rounded to 6 decimals (SPEC 13.4). */
export function sortKey(c: Vec3, f: Rect): number {
  return round(c[0] * (f.u0 + f.u1) + c[1] * (f.v0 + f.v1), DECIMALS);
}

/** The number of slices of a footprint `length` by `width`: the n that brings `length / n` closest to `width`. */
function sliceCount(length: number, width: number): number {
  let n = 1;
  let best = Math.abs(length - width);
  for (let k = 2; k <= MAX_SLICES; k++) {
    const error = Math.abs(length / k - width);
    if (error < best - EPS) {
      n = k;
      best = error;
    }
  }
  return n;
}

/** The part box cut to `[lo, hi]` along one axis; `null` when no more than EPS is left. */
function cut(box: Box, alongU: boolean, lo: number, hi: number): Box | null {
  const from = Math.max(alongU ? box.u0 : box.v0, lo);
  const to = Math.min(alongU ? box.u1 : box.v1, hi);
  if (to - from <= EPS) return null;
  return alongU ? { ...box, u0: from, u1: to } : { ...box, v0: from, v1: to };
}

/**
 * The sprites of one object (SPEC 13.4), in ascending order along its long axis. The footprint
 * and the part boxes are in world units, already rounded to 6 decimals; `c` is the camera
 * direction of the painter's order.
 */
export function spritesOf(c: Vec3, foot: Rect, parts: readonly OrderedPart[]): readonly Sprite[] {
  const ordered = [...parts].sort((a, b) => a.order - b.order);
  const w = foot.u1 - foot.u0;
  const d = foot.v1 - foot.v0;
  const alongU = w > d;
  const n = Math.abs(w - d) <= EPS || w <= EPS || d <= EPS ? 1 : sliceCount(alongU ? w : d, alongU ? d : w);
  if (n === 1) {
    return [{ key: sortKey(c, foot), footprint: foot, pieces: ordered.map((p) => ({ part: p.id, box: p.box })) }];
  }
  const a0 = alongU ? foot.u0 : foot.v0;
  const a1 = alongU ? foot.u1 : foot.v1;
  const t = Array.from({ length: n + 1 }, (_, k) => (k === 0 ? a0 : k === n ? a1 : round(a0 + (k * (a1 - a0)) / n, DECIMALS)));
  return Array.from({ length: n }, (_, k) => {
    const lo = t[k] as number;
    const hi = t[k + 1] as number;
    const slice: Rect = alongU ? { ...foot, u0: lo, u1: hi } : { ...foot, v0: lo, v1: hi };
    // The end slices reach to infinity, so that parts sticking out of the footprint stay with them.
    const pieces = ordered.flatMap((p) => {
      const box = cut(p.box, alongU, k === 0 ? -Infinity : lo, k === n - 1 ? Infinity : hi);
      return box === null ? [] : [{ part: p.id, box }];
    });
    return { key: sortKey(c, slice), footprint: slice, pieces };
  });
}

const roundRect = (r: Rect): Rect => ({ u0: round(r.u0, DECIMALS), v0: round(r.v0, DECIMALS), u1: round(r.u1, DECIMALS), v1: round(r.v1, DECIMALS) });

const roundBox = (b: Box): Box => ({
  u0: round(b.u0, DECIMALS), v0: round(b.v0, DECIMALS), h0: round(b.h0, DECIMALS),
  u1: round(b.u1, DECIMALS), v1: round(b.v1, DECIMALS), h1: round(b.h1, DECIMALS),
});

/** The sprites of every object of the scene, in file order (SPEC 13.4). Flatten them for the sprite list. */
export function sceneSprites(scene: Scene): readonly (readonly Sprite[])[] {
  const c = orderDirection(scene.camera);
  const orders = partOrders(scene);
  return scene.objects.map((object, i) => {
    const parts = worldParts(scene, object).map((p, k) => ({ id: p.id, box: roundBox(p.box), order: (orders[i] as readonly number[])[k] as number }));
    return spritesOf(c, roundRect(footprint(scene, object)), parts);
  });
}
