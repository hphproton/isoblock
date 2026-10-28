import { EPS, footprint, indexObjects, rectGap } from "../geometry";
import { fmt } from "../format";
import type { CheckResult, ClearanceCheck, Scene } from "../types";
import { marginStatus } from "./margin";
import { inObjectOrder, round6 } from "./result";

/** Edge-to-edge distance between two footprints must be at least `min`. */
export function checkClearance(scene: Scene, spec: ClearanceCheck): CheckResult {
  const objects = indexObjects(scene);
  const a = objects.get(spec.a)!;
  const b = objects.get(spec.b)!;
  const gap = rectGap(footprint(scene, a), footprint(scene, b));
  const value = round6(gap);
  const passing = gap >= spec.min - EPS;
  const status = marginStatus(passing, value, spec.min, spec.warn, "lower");
  const ok = status !== "fail";
  return {
    id: spec.id,
    check: spec.check,
    status,
    value,
    threshold: spec.min,
    ids: inObjectOrder(scene, new Set([spec.a, spec.b])),
    message: `gap ${fmt(gap)} ${ok ? ">=" : "<"} ${fmt(spec.min)}`,
  };
}
