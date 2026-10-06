import type { CheckResult, CheckSpec, ClearanceCheck, InRegionCheck, LaneClearCheck, LaneReachesCheck, VisibleCheck } from "../types";

const TIMES = "\u00d7";

/** The row label of a check in `compare` (SPEC section 11.1). `unit` is the scene's unit name. */
export function checkLabel(spec: CheckSpec, base: CheckResult, unit: string): string {
  switch (spec.check) {
    case "in_region": {
      const s = spec as InRegionCheck;
      return `in_region ${s.region}${s.strip === undefined ? "" : `/${s.strip}`} (objects outside)`;
    }
    case "no_overlap":
      return "no_overlap (pairs)";
    case "clearance": {
      const s = spec as ClearanceCheck;
      const [a, b] = base.ids.length === 2 ? base.ids : [s.a, s.b];
      return `clearance ${a}${TIMES}${b} (${unit})`;
    }
    case "lane_clear":
      return `lane_clear ${(spec as LaneClearCheck).lane} (blocking objects)`;
    case "lane_reaches":
      return `lane_reaches ${(spec as LaneReachesCheck).lane} (y px)`;
    case "visible":
      return `visible ${(spec as VisibleCheck).target} (% occluded)`;
    default:
      return `${spec.check} ${spec.id}`;
  }
}
