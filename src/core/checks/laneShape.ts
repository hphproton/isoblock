import { EPS, type Rect } from "../geometry";
import type { Lane } from "../types";

export type LaneShape =
  | { readonly ok: true; readonly rect: Rect; readonly alongU: boolean; readonly hLo: number; readonly hHi: number }
  | { readonly ok: false; readonly reason: string };

/** Height of a lane point: its third number, else the lane's `h`, else 0 (SPEC section 6). */
export function pointHeight(lane: Lane, point: readonly number[]): number {
  const h = point[2];
  return h === undefined ? (lane.h ?? 0) : h;
}

/** A lane is flat when every point has the same height within EPS. Its level is that height. */
export function laneLevel(lane: Lane): { readonly flat: boolean; readonly level: number } {
  if (lane.points.length === 0) return { flat: true, level: lane.h ?? 0 };
  const level = pointHeight(lane, lane.points[0] as readonly number[]);
  return { flat: lane.points.every((point) => Math.abs(pointHeight(lane, point) - level) <= EPS), level };
}

/**
 * Stage 1 lane shape: exactly 2 points, parallel to u or v, widened by `width / 2` on each side.
 * Anything else is unsupported.
 */
export function laneShape(lane: Lane): LaneShape {
  if (lane.points.length !== 2) {
    return { ok: false, reason: `lane "${lane.id}" has ${lane.points.length} points; only 2-point lanes are supported` };
  }
  const [p0, p1] = lane.points as unknown as readonly [readonly number[], readonly number[]];
  const [u0, v0] = p0;
  const [u1, v1] = p1;
  const half = lane.width / 2;
  const alongU = Math.abs((v1 as number) - (v0 as number)) <= EPS;
  const alongV = Math.abs((u1 as number) - (u0 as number)) <= EPS;
  if (alongU && alongV) return { ok: false, reason: `lane "${lane.id}" has zero length` };
  const h0 = pointHeight(lane, p0);
  const h1 = pointHeight(lane, p1);
  if (alongU) {
    const forward = (u0 as number) <= (u1 as number);
    return {
      ok: true,
      alongU: true,
      hLo: forward ? h0 : h1,
      hHi: forward ? h1 : h0,
      rect: { u0: Math.min(u0 as number, u1 as number), v0: (v0 as number) - half, u1: Math.max(u0 as number, u1 as number), v1: (v0 as number) + half },
    };
  }
  if (alongV) {
    const forward = (v0 as number) <= (v1 as number);
    return {
      ok: true,
      alongU: false,
      hLo: forward ? h0 : h1,
      hHi: forward ? h1 : h0,
      rect: { u0: (u0 as number) - half, v0: Math.min(v0 as number, v1 as number), u1: (u0 as number) + half, v1: Math.max(v0 as number, v1 as number) },
    };
  }
  return { ok: false, reason: `lane "${lane.id}" is not parallel to u or v; only axis-parallel lanes are supported` };
}
