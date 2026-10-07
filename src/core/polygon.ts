import { EPS } from "./geometry";
import { nearestOnSegment } from "./relations/shared";
import type { Vec2 } from "./types";

/** Crossing-number (even-odd) test: true when the point lies inside the polygon. */
export function crossingInside(points: readonly Vec2[], u: number, v: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ui, vi] = points[i] as Vec2;
    const [uj, vj] = points[j] as Vec2;
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside;
  }
  return inside;
}

/** Distance from a point to the boundary of the polygon. */
export function boundaryDistance(points: readonly Vec2[], u: number, v: number): number {
  let best = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ui, vi] = points[i] as Vec2;
    const [uj, vj] = points[j] as Vec2;
    best = Math.min(best, nearestOnSegment(u, v, uj, vj, ui, vi).distance);
  }
  return best;
}

/** A point is inside a polygon when the even-odd test says so or its distance to the boundary is at most EPS. */
export function insidePolygon(points: readonly Vec2[], u: number, v: number): boolean {
  return crossingInside(points, u, v) || boundaryDistance(points, u, v) <= EPS;
}

/** Distance from a point to the polygon: 0 inside or on the boundary, else to the nearest edge. */
export function distanceToPolygon(points: readonly Vec2[], u: number, v: number): number {
  return insidePolygon(points, u, v) ? 0 : boundaryDistance(points, u, v);
}
