import { objectRaster, type ObjectRaster } from "../raster/raster";
import type { CheckResult, CheckSpec, ImplementedCheck, Scene } from "../types";
import { checkCapacity } from "./capacity";
import { checkClearance } from "./clearance";
import { checkInRegion, updateInRegion } from "./inRegion";
import { checkLaneApart } from "./laneApart";
import { checkLaneClear } from "./laneClear";
import { checkLaneReaches } from "./laneReaches";
import { checkMinScreenSize } from "./minScreenSize";
import { checkNoOverlap, updateNoOverlap } from "./noOverlap";
import { checkReachable } from "./reachable";
import { canonical, skipResult } from "./result";
import { checkSortConsistency } from "./sortConsistency";
import { checkVisible } from "./visible";
import { checkVisibleShare } from "./visibleShare";

/**
 * Run one check. Catalog checks the current stage does not evaluate return `skip`.
 * `raster` is the object raster of `scene` shared by every `visible_share` of one run (SPEC 9.6).
 */
export function runCheck(scene: Scene, spec: CheckSpec, raster?: ObjectRaster): CheckResult {
  return canonical(evaluate(scene, spec, raster));
}

function evaluate(scene: Scene, spec: CheckSpec, raster?: ObjectRaster): CheckResult {
  const implemented = spec as ImplementedCheck;
  switch (implemented.check) {
    case "in_region":
      return checkInRegion(scene, implemented);
    case "no_overlap":
      return checkNoOverlap(scene, implemented);
    case "clearance":
      return checkClearance(scene, implemented);
    case "lane_clear":
      return checkLaneClear(scene, implemented);
    case "lane_reaches":
      return checkLaneReaches(scene, implemented);
    case "lane_apart":
      return checkLaneApart(scene, implemented);
    case "visible":
      return checkVisible(scene, implemented);
    case "reachable":
      return checkReachable(scene, implemented);
    case "capacity":
      return checkCapacity(scene, implemented);
    case "min_screen_size":
      return checkMinScreenSize(scene, implemented);
    case "sort_consistency":
      return checkSortConsistency(scene, implemented);
    case "visible_share":
      return checkVisibleShare(scene, implemented, raster);
    default:
      return skipResult(spec, `check "${spec.check}" is not implemented in this stage`);
  }
}

/**
 * The result of a check for `scene`, from its result for the scene before, when only the objects
 * in `changed` differ. Checks that can update per object do; the others run in full.
 * The result always equals `runCheck(scene, spec)`.
 */
export function updateCheck(
  scene: Scene,
  spec: CheckSpec,
  prev: CheckResult,
  changed: ReadonlySet<string>,
  raster?: ObjectRaster,
): CheckResult {
  const check = spec as ImplementedCheck;
  switch (check.check) {
    case "in_region":
      return canonical(updateInRegion(scene, check, prev, changed));
    case "no_overlap":
      return canonical(updateNoOverlap(scene, check, prev, changed));
    default:
      return runCheck(scene, spec, raster);
  }
}

/** One object raster when the scene has a `visible_share` check, else none. */
function sharedRaster(scene: Scene): ObjectRaster | undefined {
  return (scene.checks ?? []).some((spec) => spec.check === "visible_share") ? objectRaster(scene) : undefined;
}

/** Run every check of the scene, in the order of the `checks` list. */
export function runChecks(scene: Scene): readonly CheckResult[] {
  const raster = sharedRaster(scene);
  return (scene.checks ?? []).map((spec) => runCheck(scene, spec, raster));
}
