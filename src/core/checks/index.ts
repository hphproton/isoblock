import type { CheckResult, CheckSpec, ImplementedCheck, Scene } from "../types";
import { checkClearance } from "./clearance";
import { checkInRegion } from "./inRegion";
import { checkLaneClear } from "./laneClear";
import { checkLaneReaches } from "./laneReaches";
import { checkNoOverlap } from "./noOverlap";
import { canonical, skipResult } from "./result";
import { checkVisible } from "./visible";

/** Run one check. Catalog checks the current stage does not evaluate return `skip`. */
export function runCheck(scene: Scene, spec: CheckSpec): CheckResult {
  return canonical(evaluate(scene, spec));
}

function evaluate(scene: Scene, spec: CheckSpec): CheckResult {
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
    case "visible":
      return checkVisible(scene, implemented);
    default:
      return skipResult(spec, `check "${spec.check}" is not implemented in this stage`);
  }
}

/** Run every check of the scene, in the order of the `checks` list. */
export function runChecks(scene: Scene): readonly CheckResult[] {
  return (scene.checks ?? []).map((spec) => runCheck(scene, spec));
}
