import { clipToPiece, penetration } from "../convex";
import { EPS, footprint, rectCorners, sizeBox } from "../geometry";
import { shoelace } from "../polygon";
import type { Lane, Scene, SceneObject, Vec2 } from "../types";
import { pointHeight } from "./laneShape";

/** One straight piece of a lane: the segment widened by half the width, not past its ends (SPEC 9.8). */
export interface LanePiece {
  readonly corners: readonly [Vec2, Vec2, Vec2, Vec2];
  readonly origin: Vec2;
  readonly e: Vec2;
  readonly n: Vec2;
  readonly length: number;
  readonly h0: number;
  readonly h1: number;
  readonly half: number;
}

/**
 * The pieces of a lane. A segment whose ground length is at most EPS adds none. A lane with no
 * piece is an unsupported shape, as a lane of zero length was.
 */
export function lanePieces(lane: Lane): { ok: true; pieces: readonly LanePiece[] } | { ok: false; reason: string } {
  const pieces: LanePiece[] = [];
  const half = lane.width / 2;
  for (let k = 0; k < lane.points.length - 1; k++) {
    const p0 = lane.points[k] as readonly number[];
    const p1 = lane.points[k + 1] as readonly number[];
    const du = (p1[0] as number) - (p0[0] as number);
    const dv = (p1[1] as number) - (p0[1] as number);
    const length = Math.hypot(du, dv);
    if (length <= EPS) continue;
    const e: Vec2 = [du / length, dv / length];
    const n: Vec2 = [-e[1], e[0]];
    const origin: Vec2 = [p0[0] as number, p0[1] as number];
    const end: Vec2 = [p1[0] as number, p1[1] as number];
    const shift = (p: Vec2, s: number): Vec2 => [p[0] + n[0] * s, p[1] + n[1] * s];
    pieces.push({
      corners: [shift(origin, half), shift(end, half), shift(end, -half), shift(origin, -half)],
      origin,
      e,
      n,
      length,
      h0: pointHeight(lane, p0),
      h1: pointHeight(lane, p1),
      half,
    });
  }
  return pieces.length === 0 ? { ok: false, reason: `lane "${lane.id}" has zero length` } : { ok: true, pieces };
}

/** A ground point lies inside a piece, edges included within EPS (SPEC 9.8). */
export function insidePiece(piece: LanePiece, u: number, v: number): boolean {
  const along = (u - piece.origin[0]) * piece.e[0] + (v - piece.origin[1]) * piece.e[1];
  const across = (u - piece.origin[0]) * piece.n[0] + (v - piece.origin[1]) * piece.n[1];
  return along >= -EPS && along <= piece.length + EPS && Math.abs(across) <= piece.half + EPS;
}

/** Surface height of a piece at a ground point. `t` along the segment is clamped to [0, 1]. */
export function surfaceHeight(piece: LanePiece, u: number, v: number): number {
  const along = (u - piece.origin[0]) * piece.e[0] + (v - piece.origin[1]) * piece.e[1];
  const t = Math.max(0, Math.min(1, along / piece.length));
  return piece.h0 + t * (piece.h1 - piece.h0);
}

/** The footprint overlaps the piece and takes space at the surface under that overlap (SPEC 9.8). */
export function blocksPiece(
  corners: readonly Vec2[],
  piece: LanePiece,
  base: number,
  height: number,
  clear: number | undefined,
): boolean {
  if (!(penetration(corners, piece.corners) > EPS)) return false;
  const clipped = clipToPiece(corners, piece);
  if (clipped.length === 0) return false;
  let lo = Infinity;
  let hi = -Infinity;
  for (const [u, v] of clipped) {
    const h = surfaceHeight(piece, u, v);
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  if (!(base + height > lo + EPS)) return false;
  return clear === undefined || base < hi + clear - EPS;
}

/** True when the object's footprint blocks one of the lane's pieces. */
export function objectBlocksLane(scene: Scene, object: SceneObject, pieces: readonly LanePiece[], clear: number | undefined): boolean {
  const box = sizeBox(scene, object);
  const corners = rectCorners(footprint(scene, object));
  return pieces.some((piece) => blocksPiece(corners, piece, box.h0, box.h1 - box.h0, clear));
}

/** Area of the polygon clipped to the piece. */
export function pieceOverlapArea(piece: LanePiece, polygon: readonly Vec2[]): number {
  return shoelace(clipToPiece(polygon, piece));
}
