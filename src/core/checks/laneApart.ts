import { EPS, rectCorners, rectGap, rectIntersectionArea } from "../geometry";
import { clipPolygonToRect, polygonDistance, shoelace } from "../polygon";
import type { CheckResult, LaneApartCheck, Scene } from "../types";
import { laneShape } from "./laneShape";
import { round6, skipResult } from "./result";

function nameOf(target: string): string {
  return target.startsWith("lane:") || target.startsWith("zone:") ? target.slice(5) : target;
}

function result(spec: LaneApartCheck, distance: number, overlap: number, target: string): CheckResult {
  const min = spec.min ?? 0;
  const value = round6(distance);
  const area = round6(overlap);
  const pass = overlap <= EPS && distance >= min - EPS;
  const apart = pass
    ? `lane ${spec.lane} is ${value} from ${target} (overlap ${area})`
    : area > EPS
      ? `lane ${spec.lane} overlaps ${target} by ${area}`
      : `lane ${spec.lane} is ${value} from ${target} (min ${min})`;
  return {
    id: spec.id,
    check: spec.check,
    status: pass ? "pass" : "fail",
    value,
    threshold: min,
    ids: [spec.lane, target],
    overlap: area,
    message: apart,
  };
}

/**
 * A lane keeps at least `min` from another lane or from a zone, and does not overlap it (SPEC 9.4).
 * Other lane shapes, and a zone with fewer than 3 points, are `skip`.
 */
export function checkLaneApart(scene: Scene, spec: LaneApartCheck): CheckResult {
  const lane = (scene.lanes ?? []).find((item) => item.id === spec.lane);
  const shape = lane === undefined ? { ok: false as const, reason: `lane "${spec.lane}" is missing` } : laneShape(lane);
  if (!shape.ok) return skipResult(spec, shape.reason);
  const id = nameOf(spec.target);
  if (spec.target.startsWith("lane:")) {
    const other = (scene.lanes ?? []).find((item) => item.id === id);
    if (other === undefined) return skipResult(spec, `lane "${id}" is missing`);
    const otherShape = laneShape(other);
    if (!otherShape.ok) return skipResult(spec, otherShape.reason);
    return result(spec, rectGap(shape.rect, otherShape.rect), rectIntersectionArea(shape.rect, otherShape.rect), id);
  }
  if (!spec.target.startsWith("zone:")) return skipResult(spec, `target "${spec.target}" is not a lane or a zone`);
  const zone = (scene.zones ?? []).find((item) => item.id === id);
  const points = zone?.points ?? [];
  if (points.length < 3) return skipResult(spec, `zone "${id}" has ${points.length} points; a zone needs 3 or more`);
  const overlap = shoelace(clipPolygonToRect(points, shape.rect));
  const distance = polygonDistance(rectCorners(shape.rect), points);
  return result(spec, distance, overlap, id);
}
