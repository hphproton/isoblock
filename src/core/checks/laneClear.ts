import { footprint, rectsOverlap, sizeBox, takesSpace } from "../geometry";
import type { CheckResult, LaneClearCheck, Scene } from "../types";
import { laneLevel, laneShape } from "./laneShape";
import { skipResult } from "./result";

/** No object may block a lane, except the ones listed in `ignore`. From stage 12, at the lane's level. */
export function checkLaneClear(scene: Scene, spec: LaneClearCheck): CheckResult {
  const lane = (scene.lanes ?? []).find((l) => l.id === spec.lane)!;
  const shape = laneShape(lane);
  if (!shape.ok) return skipResult(spec, shape.reason);
  const level = laneLevel(lane);
  if (!level.flat) return skipResult(spec, `lane "${lane.id}" is not flat; only flat lanes are supported`);
  const ignored = new Set(spec.ignore ?? []);
  const blocking = scene.objects
    .filter((o) => !ignored.has(o.id) && rectsOverlap(footprint(scene, o), shape.rect) && takesSpace(sizeBox(scene, o), level.level, spec.height))
    .map((o) => o.id);
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
