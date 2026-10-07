import type { ObjectPolygon } from "./svgObjects";

/** `[x0, y0, x1, y1]`: pixel boxes run from the first to one past the last pixel. */
export type Box = readonly [number, number, number, number];

/** Pixels per 1,000,000 that may differ in which object they show (SPEC 13.6). */
export const FRAME_LIMIT_PER_MILLION = 100;

/**
 * Per object, in the order of `ids`: the bounds of its polygons clipped to the frame, or null when
 * nothing of it is inside the frame (no area left).
 */
export function polygonBoxes(polygons: readonly ObjectPolygon[], ids: readonly string[], width: number, height: number): (Box | null)[] {
  return ids.map((id) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of polygons.filter((q) => q.ref === id)) {
      for (const [x, y] of p.points) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
    const box: Box = [Math.max(x0, 0), Math.max(y0, 0), Math.min(x1, width), Math.min(y1, height)];
    return box[2] - box[0] > 0 && box[3] - box[1] > 0 ? box : null;
  });
}

/**
 * The largest difference of any edge between the box of drawn pixels and the box of the polygons.
 * Two empty boxes agree. A polygon box thinner than a pixel may cover no pixel center, so no pixels
 * agree with it; otherwise a missing box is an infinite difference.
 */
export function boxDifference(pixels: Box | null, polygons: Box | null): number {
  if (pixels === null && polygons === null) return 0;
  if (pixels === null) {
    const [x0, y0, x1, y1] = polygons as Box;
    return x1 - x0 < 1 || y1 - y0 < 1 ? 0 : Infinity;
  }
  if (polygons === null) return Infinity;
  return Math.max(...pixels.map((v, k) => Math.abs(v - (polygons[k] as number))));
}

/**
 * Whether pixel center (x, y) is inside the polygon (convex), with the top-left fill rule that
 * rasterizers use: a center exactly on an edge belongs to the polygon only for a top edge
 * (horizontal, interior below) or a left edge (interior to the right), so that two polygons that
 * share an edge never both take it.
 */
function contains(points: ObjectPolygon["points"], x: number, y: number): boolean {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i] as [number, number];
    const [bx, by] = points[(i + 1) % points.length] as [number, number];
    twice += ax * by - bx * ay;
  }
  if (twice === 0) return false;
  // Walk the polygon clockwise on screen (y down), where the interior is on the right of each edge.
  const sign = twice > 0 ? 1 : -1;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i] as [number, number];
    const [bx, by] = points[(i + 1) % points.length] as [number, number];
    const cross = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) * sign;
    if (cross < 0) return false;
    if (cross === 0) {
      const dx = (bx - ax) * sign;
      const dy = (by - ay) * sign;
      if (!((dy === 0 && dx > 0) || dy < 0)) return false;
    }
  }
  return true;
}

/**
 * A painter's raster of the object polygons: each pixel center takes the last polygon of the
 * document that contains it. The result holds the number of its object (index in `ids` plus 1), or
 * 0 for the background.
 */
export function paintedIds(polygons: readonly ObjectPolygon[], ids: readonly string[], width: number, height: number): Uint16Array {
  const out = new Uint16Array(width * height);
  const number = new Map(ids.map((id, i) => [id, i + 1]));
  for (const p of polygons) {
    const value = number.get(p.ref) ?? 0;
    const xs = p.points.map((q) => q[0]);
    const ys = p.points.map((q) => q[1]);
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const x1 = Math.min(width - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(height - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (contains(p.points, x + 0.5, y + 0.5)) out[y * width + x] = value;
      }
    }
  }
  return out;
}

/** Object numbers from the raw RGBA frame of the cross-check: red * 256 + green, 0 where transparent. */
export function frameIds(rgba: Uint8Array): Uint16Array {
  const out = new Uint16Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) {
    if ((rgba[i * 4 + 3] as number) > 0) out[i] = ((rgba[i * 4] as number) << 8) | (rgba[i * 4 + 1] as number);
  }
  return out;
}

export function countDifferences(a: Uint16Array, b: Uint16Array): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n += 1;
  return n;
}

/** The number of pixels per million frame pixels that may differ, for a frame of this size. */
export function frameLimit(width: number, height: number): number {
  return Math.floor((width * height * FRAME_LIMIT_PER_MILLION) / 1_000_000);
}
