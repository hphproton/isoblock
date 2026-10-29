import { EPS } from "../geometry";
import type { Lane } from "../types";

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
