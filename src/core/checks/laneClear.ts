import type { CheckResult, LaneClearCheck, Scene } from "../types";
import { lanePieces, objectBlocksLane } from "./lanePieces";
import { skipResult } from "./result";

/** No object may block a lane, except the ones listed in `ignore`. Any polyline, ramps included (SPEC 9.8). */
export function checkLaneClear(scene: Scene, spec: LaneClearCheck): CheckResult {
  const lane = (scene.lanes ?? []).find((l) => l.id === spec.lane)!;
  const shape = lanePieces(lane);
  if (!shape.ok) return skipResult(spec, shape.reason);
  const ignored = new Set(spec.ignore ?? []);
  const blocking = scene.objects
    .filter((object) => !ignored.has(object.id) && objectBlocksLane(scene, object, shape.pieces, spec.height))
    .map((object) => object.id);
  return {
    id: spec.id,
    check: spec.check,
    status: blocking.length === 0 ? "pass" : "fail",
    value: blocking.length,
    threshold: 0,
    ids: blocking,
    message: blocking.length === 0 ? `lane ${lane.id} is clear` : `lane ${lane.id} blocked by ${blocking.join(", ")}`,
  };
}
