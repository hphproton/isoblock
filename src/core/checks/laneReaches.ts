import { EPS } from "../geometry";
import { plain } from "../format";
import { project } from "../projection";
import type { CheckResult, LaneReachesCheck, Scene, Vec2 } from "../types";
import { lanePieces, type LanePiece } from "./lanePieces";
import { round6, skipResult } from "./result";

/**
 * The range of a convex polygon along the line where coordinate `axis` equals `line`
 * (`0` is x, `1` is y). Null when they do not meet.
 */
function crossing(polygon: readonly Vec2[], axis: 0 | 1, line: number): readonly [number, number] | null {
  const other = (1 - axis) as 0 | 1;
  const coords: number[] = [];
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length] as Vec2;
    const dp = p[axis] - line;
    const dq = q[axis] - line;
    if (Math.abs(dp) <= EPS) coords.push(p[other]);
    if (Math.abs(dq) <= EPS && Math.abs(dp) > EPS) coords.push(q[other]);
    if ((dp < -EPS && dq > EPS) || (dp > EPS && dq < -EPS)) {
      coords.push(p[other] + ((q[other] - p[other]) * dp) / (dp - dq));
    }
  });
  return coords.length === 0 ? null : [Math.min(...coords), Math.max(...coords)];
}

/** Project a piece with each end at that end's height. Corners next to Pk use h_k. */
function projected(scene: Scene, piece: LanePiece): Vec2[] {
  return piece.corners.map((corner, index) => {
    const h = index === 0 || index === 3 ? piece.h0 : piece.h1;
    return project(scene.camera, corner[0], corner[1], h);
  });
}

/** A lane must meet a frame edge inside the region's range along that edge (SPEC 9.1, 9.8). */
export function checkLaneReaches(scene: Scene, spec: LaneReachesCheck): CheckResult {
  const lane = (scene.lanes ?? []).find((l) => l.id === spec.lane)!;
  const region = scene.frame.regions.find((r) => r.id === spec.region)!;
  if (scene.hiddenRegions?.includes(spec.region)) {
    return skipResult(spec, `region "${spec.region}" is hidden in state "${scene.activeState ?? ""}"`);
  }
  const shape = lanePieces(lane);
  if (!shape.ok) return skipResult(spec, shape.reason);
  const vertical = spec.edge === "right" || spec.edge === "left";
  const line = spec.edge === "right" ? scene.frame.w : spec.edge === "bottom" ? scene.frame.h : 0;
  const [start, end] = vertical ? [region.rect[1], region.rect[3]] : [region.rect[0], region.rect[2]];
  const hits = shape.pieces.flatMap((piece) => {
    const hit = crossing(projected(scene, piece), vertical ? 0 : 1, line);
    return hit === null ? [] : [hit];
  });
  const base = { id: spec.id, check: spec.check, threshold: [start, end] as const, ids: [lane.id] };
  if (hits.length === 0) return { ...base, status: "fail", value: null, message: "lane does not reach edge" };
  const largest = Math.max(...hits.map((hit) => hit[1]));
  const ok = hits.every((hit) => hit[0] >= start - EPS && hit[1] <= end + EPS);
  const axis = vertical ? "y" : "x";
  return {
    ...base,
    status: ok ? "pass" : "fail",
    value: round6(largest),
    message: `lane ${lane.id} meets ${spec.edge} edge at ${axis}=${largest.toFixed(2)} (${region.id} ${axis} ${plain(start)}-${plain(end)})`,
  };
}
