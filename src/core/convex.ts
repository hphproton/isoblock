import { EPS } from "./geometry";
import type { Vec2 } from "./types";

/**
 * Separating-axis penetration of two convex polygons (SPEC 9.8): the smallest overlap of their
 * projections onto an edge normal. Above EPS, the polygons overlap. A negative value is a gap.
 */
export function penetration(a: readonly Vec2[], b: readonly Vec2[]): number {
  let best = Infinity;
  const consider = (poly: readonly Vec2[]): void => {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const p = poly[j] as Vec2;
      const q = poly[i] as Vec2;
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const len = Math.hypot(dx, dy);
      if (len <= EPS) continue;
      const ax = -dy / len;
      const ay = dx / len;
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      let b1 = -Infinity;
      for (const [x, y] of a) {
        const d = x * ax + y * ay;
        if (d < a0) a0 = d;
        if (d > a1) a1 = d;
      }
      for (const [x, y] of b) {
        const d = x * ax + y * ay;
        if (d < b0) b0 = d;
        if (d > b1) b1 = d;
      }
      const overlap = Math.min(a1, b1) - Math.max(a0, b0);
      if (overlap < best) best = overlap;
    }
  };
  consider(a);
  consider(b);
  return best;
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Keep the part of the polygon on the inside of one half-plane. */
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

/** A rectangle in the frame of one lane piece: along `e` from 0 to `length`, across `n` by `half`. */
export interface PieceFrame {
  readonly origin: Vec2;
  readonly e: Vec2;
  readonly n: Vec2;
  readonly length: number;
  readonly half: number;
}

function crossAt(a: Vec2, b: Vec2, coord: (p: Vec2) => number, bound: number): Vec2 {
  const ca = coord(a);
  const cb = coord(b);
  const delta = cb - ca;
  return lerp(a, b, delta === 0 ? 0 : (bound - ca) / delta);
}

/** The subject polygon clipped to a lane piece (Sutherland-Hodgman against its four sides). */
export function clipToPiece(subject: readonly Vec2[], piece: PieceFrame): Vec2[] {
  const along = (p: Vec2): number => (p[0] - piece.origin[0]) * piece.e[0] + (p[1] - piece.origin[1]) * piece.e[1];
  const across = (p: Vec2): number => (p[0] - piece.origin[0]) * piece.n[0] + (p[1] - piece.origin[1]) * piece.n[1];
  const planes: readonly [(p: Vec2) => boolean, (a: Vec2, b: Vec2) => Vec2][] = [
    [(p) => along(p) >= 0, (a, b) => crossAt(a, b, along, 0)],
    [(p) => along(p) <= piece.length, (a, b) => crossAt(a, b, along, piece.length)],
    [(p) => across(p) <= piece.half, (a, b) => crossAt(a, b, across, piece.half)],
    [(p) => across(p) >= -piece.half, (a, b) => crossAt(a, b, across, -piece.half)],
  ];
  return planes.reduce((poly, [inside, cross]) => clipHalf(poly, inside, cross), [...subject]);
}
