import type { Box } from "../geometry";
import type { Vec2 } from "../types";

type Point = readonly [number, number];

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Convex hull in counter-clockwise order (monotone chain); collinear points are dropped. */
export function convexHull(points: readonly Point[]): readonly Point[] {
  const sorted = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (sorted.length < 3) return sorted;
  const half = (list: readonly Point[]): Point[] => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2] as Point, out[out.length - 1] as Point, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

export function polygonArea(polygon: readonly Point[]): number {
  let twice = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j] as Point;
    const b = polygon[i] as Point;
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return twice / 2;
}

/** The part of `subject` on the left of the directed edge `a` to `b` (one step of Sutherland-Hodgman). */
function clipEdge(subject: readonly Point[], a: Point, b: Point): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < subject.length; i++) {
    const p = subject[i] as Point;
    const q = subject[(i + 1) % subject.length] as Point;
    const sp = cross(a, b, p);
    const sq = cross(a, b, q);
    if (sp >= 0) out.push(p);
    if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

/** Area of the intersection of two convex polygons (counter-clockwise); 0 when either has no area. */
export function convexOverlapArea(a: readonly Point[], b: readonly Point[]): number {
  if (a.length < 3 || b.length < 3) return 0;
  let clipped: Point[] = [...a];
  for (let i = 0; i < b.length && clipped.length > 0; i++) {
    clipped = clipEdge(clipped, b[i] as Point, b[(i + 1) % b.length] as Point);
  }
  return clipped.length < 3 ? 0 : Math.abs(polygonArea(clipped));
}

/** The outline of a box on the screen: the convex hull of its 8 projected corners (SPEC 9.3). */
export function boxOutline(box: Box, at: (u: number, v: number, h: number) => Vec2): readonly Point[] {
  const corners: Point[] = [];
  for (const u of [box.u0, box.u1]) for (const v of [box.v0, box.v1]) for (const h of [box.h0, box.h1]) corners.push(at(u, v, h));
  return convexHull(corners);
}
