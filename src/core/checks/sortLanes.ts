import { boxesOverlap, EPS, rectGap, type Box, type Rect } from "../geometry";
import { insidePolygon } from "../polygon";
import type { CheckResult, Scene, Vec2, Vec3 } from "../types";
import { insidePiece, lanePieces, surfaceHeight, type LanePiece } from "./lanePieces";
import { skipResult } from "./result";
import { recordActor, type PositionRank, type SortPass } from "./sortMeasure";
import { MAX_CELLS } from "./walkGrid";

/** Integers i whose center (i + 0.5) * step lies in [lo, hi], edges included within EPS. */
function span(lo: number, hi: number, step: number): readonly [number, number] {
  return [Math.ceil((lo - EPS) / step - 0.5), Math.floor((hi + EPS) / step - 0.5)];
}

function actorFoot(p: Vec2, e: Vec2, actor: Vec3): Rect {
  const [l, b] = actor;
  const hu = (Math.abs(e[0]) * l + Math.abs(e[1]) * b) / 2;
  const hv = (Math.abs(e[1]) * l + Math.abs(e[0]) * b) / 2;
  return { u0: p[0] - hu, v0: p[1] - hv, u1: p[0] + hu, v1: p[1] + hv };
}

function blockedAt(scene: Scene, u: number, v: number, level: number): boolean {
  return (scene.zones ?? []).some((zone) => {
    const points = zone.points ?? [];
    return zone.kind === "blocked" && points.length >= 3 && Math.abs((zone.h ?? 0) - level) <= EPS && insidePolygon(points, u, v);
  });
}

/**
 * Positions inside the named lanes (SPEC 9.10). A lane with no piece, or a grid of more than
 * 4,000,000 points, skips the check. The per-object cell limit of 9.3 does not apply.
 */
export function countLanes(pass: SortPass): PositionRank | CheckResult {
  const named = pass.spec.lanes ?? [];
  const groups: (readonly LanePiece[])[] = [];
  let u0 = Infinity;
  let v0 = Infinity;
  let u1 = -Infinity;
  let v1 = -Infinity;
  for (const id of named) {
    const lane = (pass.scene.lanes ?? []).find((item) => item.id === id);
    const shape = lane === undefined ? { ok: false as const, reason: `lane "${id}" has zero length` } : lanePieces(lane);
    if (!shape.ok) return skipResult(pass.spec, shape.reason);
    groups.push(shape.pieces);
    for (const piece of shape.pieces) {
      for (const [u, v] of piece.corners) {
        if (u < u0) u0 = u;
        if (v < v0) v0 = v;
        if (u > u1) u1 = u;
        if (v > v1) v1 = v;
      }
    }
  }
  const { step, reach, obstacles } = pass;
  const [i0, i1] = span(u0, u1, step);
  const [j0, j1] = span(v0, v1, step);
  const columns = i1 >= i0 ? i1 - i0 + 1 : 0;
  const rows = j1 >= j0 ? j1 - j0 + 1 : 0;
  if (columns * rows > MAX_CELLS) return skipResult(pass.spec, `the search has more than ${MAX_CELLS} cells; use a larger step`);
  const worst = pass.examined.map((index) => pass.base[index] as number);
  let positions = 0;
  for (let i = i0; i <= i1; i++) {
    const u = (i + 0.5) * step;
    for (let j = j0; j <= j1; j++) {
      const v = (j + 0.5) * step;
      for (const pieces of groups) {
        const piece = pieces.find((item) => insidePiece(item, u, v));
        if (piece === undefined) continue;
        const level = surfaceHeight(piece, u, v);
        const foot = actorFoot([u, v], piece.e, pass.spec.actor);
        const box: Box = { ...foot, h0: level, h1: level + pass.spec.actor[2] };
        if (obstacles.some((obstacle) => boxesOverlap(box, obstacle))) continue;
        if (blockedAt(pass.scene, u, v, level)) continue;
        pass.examined.forEach((index, slot) => {
          const target = pass.footprints[index] as Rect;
          if (rectGap(foot, target) > reach + EPS) return;
          positions += 1;
          recordActor(pass, index, slot, worst, foot, level);
        });
      }
    }
  }
  return { worst, positions };
}
