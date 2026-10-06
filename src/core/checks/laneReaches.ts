import { EPS, rectCorners } from "../geometry";
import { plain } from "../format";
import { project } from "../projection";
import type { CheckResult, LaneReachesCheck, Scene, Vec2 } from "../types";
import { laneShape } from "./laneShape";
import { round6, skipResult } from "./result";

/** y range of a convex polygon along the vertical line `x = line`, or null when they do not meet. */
function crossing(polygon: readonly Vec2[], line: number): readonly [number, number] | null {
  const ys: number[] = [];
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length] as Vec2;
    const dp = p[0] - line;
    const dq = q[0] - line;
    if (Math.abs(dp) <= EPS) ys.push(p[1]);
    if (Math.abs(dq) <= EPS) ys.push(q[1]);
    if ((dp < -EPS && dq > EPS) || (dp > EPS && dq < -EPS)) ys.push(p[1] + ((q[1] - p[1]) * dp) / (dp - dq));
  });
  return ys.length === 0 ? null : [Math.min(...ys), Math.max(...ys)];
}

/** A lane must meet the frame edge (`right` or `left`) inside the y range of a region. */
export function checkLaneReaches(scene: Scene, spec: LaneReachesCheck): CheckResult {
  if (spec.edge === "top" || spec.edge === "bottom") {
    return skipResult(spec, `edge "${spec.edge}" is not evaluated in this stage`);
  }
  const lane = (scene.lanes ?? []).find((l) => l.id === spec.lane)!;
  const region = scene.frame.regions.find((r) => r.id === spec.region)!;
  const shape = laneShape(lane);
  if (!shape.ok) return skipResult(spec, shape.reason);
  const [, y0, , y1] = region.rect;
  const polygon = rectCorners(shape.rect).map(([u, v]) => project(scene.camera, u, v, 0));
  const hit = crossing(polygon, spec.edge === "right" ? scene.frame.w : 0);
  const base = { id: spec.id, check: spec.check, threshold: [y0, y1] as const, ids: [lane.id] };
  if (hit === null) {
    return { ...base, status: "fail", value: null, message: "lane does not reach edge" };
  }
  const ok = hit[0] >= y0 - EPS && hit[1] <= y1 + EPS;
  return {
    ...base,
    status: ok ? "pass" : "fail",
    value: round6(hit[1]),
    message: `lane ${lane.id} meets ${spec.edge} edge at y=${hit[1].toFixed(2)} (${region.id} y ${plain(y0)}-${plain(y1)})`,
  };
}
