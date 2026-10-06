import { EPS, type Rect } from "../geometry";
import type { Lane } from "../types";

export type LaneShape =
  | { readonly ok: true; readonly rect: Rect }
  | { readonly ok: false; readonly reason: string };

/**
 * Stage 1 lane shape: exactly 2 points, parallel to u or v, widened by `width / 2` on each side.
 * Anything else is unsupported.
 */
export function laneShape(lane: Lane): LaneShape {
  if (lane.points.length !== 2) {
    return { ok: false, reason: `lane "${lane.id}" has ${lane.points.length} points; only 2-point lanes are supported` };
  }
  const [[u0, v0], [u1, v1]] = lane.points as readonly [readonly [number, number], readonly [number, number]];
  const half = lane.width / 2;
  const alongU = Math.abs(v1 - v0) <= EPS;
  const alongV = Math.abs(u1 - u0) <= EPS;
  if (alongU && alongV) return { ok: false, reason: `lane "${lane.id}" has zero length` };
  if (alongU) {
    return { ok: true, rect: { u0: Math.min(u0, u1), v0: v0 - half, u1: Math.max(u0, u1), v1: v0 + half } };
  }
  if (alongV) {
    return { ok: true, rect: { u0: u0 - half, v0: Math.min(v0, v1), u1: u0 + half, v1: Math.max(v0, v1) } };
  }
  return { ok: false, reason: `lane "${lane.id}" is not parallel to u or v; only axis-parallel lanes are supported` };
}
