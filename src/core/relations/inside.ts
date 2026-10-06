import { EPS, rectCorners, type Rect } from "../geometry";
import { fmt } from "../format";
import type { Vec2, Zone } from "../types";
import { nearestOnSegment, SATISFIED, type Measure, type Rects } from "./shared";

/** Crossing-number test: true when the point lies inside the polygon. */
function contains(points: readonly Vec2[], u: number, v: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ui, vi] = points[i] as Vec2;
    const [uj, vj] = points[j] as Vec2;
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside;
  }
  return inside;
}

/** Distance from a point to the zone: 0 inside or on the boundary, else to the nearest edge. */
function distanceToZone(points: readonly Vec2[], u: number, v: number): number {
  let best = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ui, vi] = points[i] as Vec2;
    const [uj, vj] = points[j] as Vec2;
    best = Math.min(best, nearestOnSegment(u, v, uj, vj, ui, vi).distance);
  }
  return best <= EPS || contains(points, u, v) ? 0 : best;
}

/** `inside`: the largest distance from a footprint corner to the zone. Needs 3 or more points. */
export function insideMeasure(a: number, zone: Zone): Measure | string {
  const points = zone.points ?? [];
  if (points.length < 3) return `zone "${zone.id}" has ${points.length} points; inside needs 3 or more`;
  const largest = (rects: Rects) =>
    Math.max(...rectCorners(rects[a] as Rect).map(([u, v]) => distanceToZone(points, u, v)));
  return {
    violation: largest,
    message: (rects) => {
      const d = largest(rects);
      return d > SATISFIED ? `a corner is ${fmt(d)} outside zone ${zone.id}` : `all corners inside zone ${zone.id}`;
    },
  };
}
