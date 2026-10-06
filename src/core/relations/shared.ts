import { EPS, type Rect } from "../geometry";
import { fmt } from "../format";

/** Footprints indexed like `scene.objects`. */
export type Rects = readonly Rect[];

/** A closed range `[min, max]`; `max` may be `Infinity`. */
export type Band = readonly [number, number];

/** How a measurable relation is measured. Both functions read the footprints `rects`. */
export interface Measure {
  readonly violation: (rects: Rects) => number;
  readonly message: (rects: Rects) => string;
}

/** A violation up to this value counts as satisfied (SPEC section 7). */
export const SATISFIED = 1e-6;

/** Band violation of q with [min, max]: `max(0, min - q) + max(0, q - max)`. */
export function band(q: number, [min, max]: Band): number {
  return Math.max(0, min - q) + Math.max(0, q - max);
}

/** `>= 0`, `= 0` or `1.00..1.50`. */
export function bandText([min, max]: Band): string {
  if (max === Infinity) return `>= ${fmt(min)}`;
  return min === max ? `= ${fmt(min)}` : `${fmt(min)}..${fmt(max)}`;
}

/** `<quantity> <q>, wanted <band>`, with the violation when there is one. */
export function bandMessage(quantity: string, q: number, wanted: Band): string {
  const v = band(q, wanted);
  return `${quantity} ${fmt(q)}, wanted ${bandText(wanted)}${v > SATISFIED ? ` (violation ${fmt(v)})` : ""}`;
}

/** Overlap of two rectangles: `min(overlap along u, overlap along v)` when both exceed EPS, else 0. */
export function overlapAmount(a: Rect, b: Rect): number {
  const ou = Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0);
  const ov = Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0);
  return ou > EPS && ov > EPS ? Math.min(ou, ov) : 0;
}

/** Center of a footprint along `u` or `v`. */
export function centerAlong(r: Rect, axis: "u" | "v"): number {
  return axis === "u" ? (r.u0 + r.u1) / 2 : (r.v0 + r.v1) / 2;
}

/** Smallest and largest value of `cu * u + cv * v` over the 4 corners of a footprint. */
export function linearRange(r: Rect, cu: number, cv: number): readonly [number, number] {
  const lo = Math.min(cu * r.u0, cu * r.u1) + Math.min(cv * r.v0, cv * r.v1);
  const hi = Math.max(cu * r.u0, cu * r.u1) + Math.max(cv * r.v0, cv * r.v1);
  return [lo, hi];
}

/** Distance from point p to the segment from a to b, and the nearest point. */
export function nearestOnSegment(
  pu: number, pv: number, au: number, av: number, bu: number, bv: number,
): { readonly distance: number; readonly u: number; readonly v: number } {
  const du = bu - au;
  const dv = bv - av;
  const len2 = du * du + dv * dv;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((pu - au) * du + (pv - av) * dv) / len2));
  const u = au + t * du;
  const v = av + t * dv;
  return { distance: Math.hypot(pu - u, pv - v), u, v };
}
