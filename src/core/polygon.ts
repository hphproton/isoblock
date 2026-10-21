import { EPS, type Rect } from "./geometry";
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

/** Absolute value of the shoelace formula, so the order of the points does not matter. */
export function shoelace(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ui, vi] = points[i] as Vec2;
    const [uj, vj] = points[j] as Vec2;
    sum += uj * vi - ui * vj;
  }
  return Math.abs(sum) / 2;
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Sutherland-Hodgman step: keep the part of the polygon on the inside of one infinite edge. */
function clipHalf(subject: readonly Vec2[], inside: (p: Vec2) => boolean, cross: (a: Vec2, b: Vec2) => Vec2): Vec2[] {
  const out: Vec2[] = [];
  if (subject.length === 0) return out;
  let prev = subject[subject.length - 1] as Vec2;
  let prevIn = inside(prev);
  for (const cur of subject) {
    const curIn = inside(cur);
    if (curIn) {
      if (!prevIn) out.push(cross(prev, cur));
      out.push(cur);
    } else if (prevIn) out.push(cross(prev, cur));
    prev = cur;
    prevIn = curIn;
  }
  return out;
}

function crossAt(a: Vec2, b: Vec2, axis: 0 | 1, bound: number): Vec2 {
  const delta = b[axis] - a[axis];
  return lerp(a, b, delta === 0 ? 0 : (bound - a[axis]) / delta);
}

/** The polygon clipped to an axis-aligned rectangle (Sutherland-Hodgman against its four sides). */
export function clipPolygonToRect(points: readonly Vec2[], rect: Rect): Vec2[] {
  const { u0, v0, u1, v1 } = rect;
  const planes: readonly [(p: Vec2) => boolean, (a: Vec2, b: Vec2) => Vec2][] = [
    [(p) => p[0] >= u0, (a, b) => crossAt(a, b, 0, u0)],
    [(p) => p[0] <= u1, (a, b) => crossAt(a, b, 0, u1)],
    [(p) => p[1] >= v0, (a, b) => crossAt(a, b, 1, v0)],
    [(p) => p[1] <= v1, (a, b) => crossAt(a, b, 1, v1)],
  ];
  return planes.reduce((poly, [inside, cross]) => clipHalf(poly, inside, cross), [...points]);
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** True when the open segments cross. Touching at an endpoint does not count. */
function edgesCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = orient(a[0], a[1], b[0], b[1], c[0], c[1]);
  const o2 = orient(a[0], a[1], b[0], b[1], d[0], d[1]);
  const o3 = orient(c[0], c[1], d[0], d[1], a[0], a[1]);
  const o4 = orient(c[0], c[1], d[0], d[1], b[0], b[1]);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function segmentDistance(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  return Math.min(
    nearestOnSegment(a[0], a[1], c[0], c[1], d[0], d[1]).distance,
    nearestOnSegment(b[0], b[1], c[0], c[1], d[0], d[1]).distance,
    nearestOnSegment(c[0], c[1], a[0], a[1], b[0], b[1]).distance,
    nearestOnSegment(d[0], d[1], a[0], a[1], b[0], b[1]).distance,
  );
}

/**
 * Distance between two polygons (SPEC 9.4): 0 when a corner of one lies inside the other
 * (even-odd rule) or two edges cross; otherwise the smallest distance between their edges.
 */
export function polygonDistance(a: readonly Vec2[], b: readonly Vec2[]): number {
  if (a.some(([u, v]) => crossingInside(b, u, v)) || b.some(([u, v]) => crossingInside(a, u, v))) return 0;
  let best = Infinity;
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
    for (let k = 0, l = b.length - 1; k < b.length; l = k++) {
      const e1a = a[j] as Vec2;
      const e1b = a[i] as Vec2;
      const e2a = b[l] as Vec2;
      const e2b = b[k] as Vec2;
      if (edgesCross(e1a, e1b, e2a, e2b)) return 0;
      best = Math.min(best, segmentDistance(e1a, e1b, e2a, e2b));
    }
  }
  return best;
}
