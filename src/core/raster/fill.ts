import { convexHull } from "../sort/outline";
import type { Box } from "../geometry";
import type { Vec2 } from "../types";

type Point = readonly [number, number];

interface Edge {
  readonly dx: number;
  readonly dy: number;
  readonly x0: number;
  readonly y0: number;
  readonly top: boolean;
  readonly left: boolean;
}

/** Snap a screen coordinate to 1/256 px (SPEC 14.1). */
function snap(value: number): number {
  return Math.floor(256 * value + 0.5);
}

function twiceArea(poly: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Point;
    const b = poly[(i + 1) % poly.length] as Point;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum;
}

/**
 * The outline of a part: the convex hull of its 8 projected corners, each snapped to 1/256 px.
 * Vertices run clockwise on the screen (positive shoelace, y down). Fewer than 3 points, or no
 * area, covers nothing.
 */
export function partOutline(box: Box, at: (u: number, v: number, h: number) => Vec2): readonly Point[] | null {
  const raw: Point[] = [];
  for (const u of [box.u0, box.u1]) {
    for (const v of [box.v0, box.v1]) {
      for (const h of [box.h0, box.h1]) {
        const [x, y] = at(u, v, h);
        raw.push([snap(x), snap(y)]);
      }
    }
  }
  const hull = convexHull(raw);
  if (hull.length < 3) return null;
  const area = twiceArea(hull);
  if (area === 0) return null;
  return area > 0 ? hull : [...hull].reverse();
}

function edgesOf(poly: readonly Point[]): Edge[] {
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length] as Point;
    return {
      dx: q[0] - p[0],
      dy: q[1] - p[1],
      x0: p[0],
      y0: p[1],
      top: p[1] === q[1] && q[0] > p[0],
      left: q[1] < p[1],
    };
  });
}

/** Top-left rule (SPEC 14.1): a center is inside when every edge has it strictly to the left, or on a top or left edge. */
function covers(edges: readonly Edge[], px: number, py: number): boolean {
  for (const edge of edges) {
    const side = edge.dx * (py - edge.y0) - edge.dy * (px - edge.x0);
    if (side > 0) continue;
    if (side < 0 || (!edge.top && !edge.left)) return false;
  }
  return true;
}

/**
 * Paint every pixel of the raster whose center lies inside `poly`. `poly` is in 1/256 px units.
 * Pixel (i, j) has its center at (256 * i + 128, 256 * j + 128).
 */
export function paintOutline(
  poly: readonly Point[],
  width: number,
  height: number,
  paint: (index: number) => void,
): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const i0 = Math.max(0, Math.floor((minX - 128) / 256));
  const j0 = Math.max(0, Math.floor((minY - 128) / 256));
  const i1 = Math.min(width - 1, Math.floor((maxX - 128) / 256));
  const j1 = Math.min(height - 1, Math.floor((maxY - 128) / 256));
  if (i1 < i0 || j1 < j0) return;
  const edges = edgesOf(poly);
  for (let j = j0; j <= j1; j++) {
    const py = 256 * j + 128;
    const row = j * width;
    for (let i = i0; i <= i1; i++) {
      if (covers(edges, 256 * i + 128, py)) paint(row + i);
    }
  }
}
