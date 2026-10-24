import { EPS } from "../geometry";
import { plain } from "../format";
import { project } from "../projection";
import type { CheckResult, LaneReachesCheck, Scene, Vec2 } from "../types";
import { laneShape } from "./laneShape";
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
    if (Math.abs(dq) <= EPS) coords.push(q[other]);
    if ((dp < -EPS && dq > EPS) || (dp > EPS && dq < -EPS)) {
      coords.push(p[other] + ((q[other] - p[other]) * dp) / (dp - dq));
    }
  });
  return coords.length === 0 ? null : [Math.min(...coords), Math.max(...coords)];
}

/** A lane must meet a frame edge inside the region's range along that edge (SPEC section 9.1). */
export function checkLaneReaches(scene: Scene, spec: LaneReachesCheck): CheckResult {
  const lane = (scene.lanes ?? []).find((l) => l.id === spec.lane)!;
  const region = scene.frame.regions.find((r) => r.id === spec.region)!;
  if (scene.hiddenRegions?.includes(spec.region)) {
    return skipResult(spec, `region "${spec.region}" is hidden in state "${scene.activeState ?? ""}"`);
  }
  const shape = laneShape(lane);
  if (!shape.ok) return skipResult(spec, shape.reason);
  const vertical = spec.edge === "right" || spec.edge === "left";
  const line = spec.edge === "right" ? scene.frame.w : spec.edge === "bottom" ? scene.frame.h : 0;
  const [start, end] = vertical ? [region.rect[1], region.rect[3]] : [region.rect[0], region.rect[2]];
  const { rect, alongU, hLo, hHi } = shape;
  const corners: readonly (readonly [number, number, number])[] = alongU
    ? [[rect.u0, rect.v0, hLo], [rect.u1, rect.v0, hHi], [rect.u1, rect.v1, hHi], [rect.u0, rect.v1, hLo]]
    : [[rect.u0, rect.v0, hLo], [rect.u1, rect.v0, hLo], [rect.u1, rect.v1, hHi], [rect.u0, rect.v1, hHi]];
  const polygon = corners.map(([u, v, h]) => project(scene.camera, u, v, h));
  const hit = crossing(polygon, vertical ? 0 : 1, line);
  const base = { id: spec.id, check: spec.check, threshold: [start, end] as const, ids: [lane.id] };
  if (hit === null) return { ...base, status: "fail", value: null, message: "lane does not reach edge" };
  const axis = vertical ? "y" : "x";
  const ok = hit[0] >= start - EPS && hit[1] <= end + EPS;
  return {
    ...base,
    status: ok ? "pass" : "fail",
    value: round6(hit[1]),
    message: `lane ${lane.id} meets ${spec.edge} edge at ${axis}=${hit[1].toFixed(2)} (${region.id} ${axis} ${plain(start)}-${plain(end)})`,
  };
}
