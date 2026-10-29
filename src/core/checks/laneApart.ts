import { EPS } from "../geometry";
import { polygonDistance } from "../polygon";
import type { CheckResult, LaneApartCheck, Scene, Vec2 } from "../types";
import { lanePieces, pieceOverlapArea, type LanePiece } from "./lanePieces";
import { marginStatus } from "./margin";
import { round6, skipResult } from "./result";

function nameOf(target: string): string {
  return target.startsWith("lane:") || target.startsWith("zone:") ? target.slice(5) : target;
}

function result(spec: LaneApartCheck, distance: number, overlap: number, target: string): CheckResult {
  const min = spec.min ?? 0;
  const value = round6(distance);
  const area = round6(overlap);
  const passing = overlap <= EPS && distance >= min - EPS;
  const status = marginStatus(passing, value, min, spec.warn, "lower");
  const apart = status !== "fail"
    ? `lane ${spec.lane} is ${value} from ${target} (overlap ${area})`
    : area > EPS
      ? `lane ${spec.lane} overlaps ${target} by ${area}`
      : `lane ${spec.lane} is ${value} from ${target} (min ${min})`;
  return {
    id: spec.id,
    check: spec.check,
    status,
    value,
    threshold: min,
    ids: [spec.lane, target],
    overlap: area,
    message: apart,
  };
}

/** Smallest polygon distance from the pieces to the polygon, and the largest intersection area. */
function measure(pieces: readonly LanePiece[], polygon: readonly Vec2[]): readonly [number, number] {
  let distance = Infinity;
  let overlap = 0;
  for (const piece of pieces) {
    distance = Math.min(distance, polygonDistance(piece.corners, polygon));
    overlap = Math.max(overlap, pieceOverlapArea(piece, polygon));
  }
  return [distance, overlap];
}

/**
 * A lane keeps at least `min` from another lane or from a zone, and does not overlap it (SPEC 9.4, 9.8).
 * A lane without a piece, and a zone with fewer than 3 points, are `skip`.
 */
export function checkLaneApart(scene: Scene, spec: LaneApartCheck): CheckResult {
  const lane = (scene.lanes ?? []).find((item) => item.id === spec.lane);
  const shape = lane === undefined ? { ok: false as const, reason: `lane "${spec.lane}" is missing` } : lanePieces(lane);
  if (!shape.ok) return skipResult(spec, shape.reason);
  const id = nameOf(spec.target);
  if (spec.target.startsWith("lane:")) {
    const other = (scene.lanes ?? []).find((item) => item.id === id);
    if (other === undefined) return skipResult(spec, `lane "${id}" is missing`);
    const otherShape = lanePieces(other);
    if (!otherShape.ok) return skipResult(spec, otherShape.reason);
    let distance = Infinity;
    let overlap = 0;
    for (const piece of shape.pieces) {
      const [d, area] = measure(otherShape.pieces, piece.corners);
      distance = Math.min(distance, d);
      overlap = Math.max(overlap, area);
    }
    return result(spec, distance, overlap, id);
  }
  if (!spec.target.startsWith("zone:")) return skipResult(spec, `target "${spec.target}" is not a lane or a zone`);
  const zone = (scene.zones ?? []).find((item) => item.id === id);
  const points = zone?.points ?? [];
  if (points.length < 3) return skipResult(spec, `zone "${id}" has ${points.length} points; a zone needs 3 or more`);
  const [distance, overlap] = measure(shape.pieces, points);
  return result(spec, distance, overlap, id);
}
