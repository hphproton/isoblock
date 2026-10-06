import { EPS, type Rect } from "../geometry";
import { fmt } from "../format";
import type { Lane, Vec2 } from "../types";
import { band, bandText, centerAlong, nearestOnSegment, SATISFIED, type Band, type Measure, type Rects } from "./shared";

interface LanePoint {
  /** Distance e from the point to the lane. */
  readonly offset: number;
  /** Length along the lane up to the nearest point, divided by the lane length. */
  readonly t: number;
}

function laneLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [u0, v0] = points[i - 1] as Vec2;
    const [u1, v1] = points[i] as Vec2;
    total += Math.hypot(u1 - u0, v1 - v0);
  }
  return total;
}

/** The point of the polyline nearest to (u, v); the first one along the lane when several are equally near. */
function nearestOnLane(points: readonly Vec2[], length: number, u: number, v: number): LanePoint {
  let best = { offset: Infinity, t: 0 };
  let along = 0;
  for (let i = 1; i < points.length; i++) {
    const [u0, v0] = points[i - 1] as Vec2;
    const [u1, v1] = points[i] as Vec2;
    const q = nearestOnSegment(u, v, u0, v0, u1, v1);
    if (q.distance < best.offset - EPS) best = { offset: q.distance, t: (along + Math.hypot(q.u - u0, q.v - v0)) / length };
    along += Math.hypot(u1 - u0, v1 - v0);
  }
  return best;
}

/**
 * `on_lane`: p = center of a, q = the nearest point of the lane, e = |p - q|, t = position of q
 * along the lane. Violation `max(0, e - width / 2) + length * (band violation of t)`.
 */
export function onLaneMeasure(a: number, lane: Lane, range: Band): Measure | string {
  const length = laneLength(lane.points);
  if (length <= EPS) return `lane "${lane.id}" has zero length`;
  const half = lane.width / 2;
  const at = (rects: Rects) => {
    const r = rects[a] as Rect;
    return nearestOnLane(lane.points, length, centerAlong(r, "u"), centerAlong(r, "v"));
  };
  const violation = (rects: Rects) => {
    const p = at(rects);
    return Math.max(0, p.offset - half) + length * band(p.t, range);
  };
  return {
    violation,
    message: (rects) => {
      const p = at(rects);
      const v = violation(rects);
      const wanted = `wanted offset <= ${fmt(half)} and t ${bandText(range)}`;
      return `offset ${fmt(p.offset)}, t ${fmt(p.t)}, ${wanted}${v > SATISFIED ? ` (violation ${fmt(v)})` : ""}`;
    },
  };
}
