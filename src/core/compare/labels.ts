import type {
  CapacityCheck,
  CheckResult,
  CheckSpec,
  ClearanceCheck,
  InRegionCheck,
  LaneApartCheck,
  LaneClearCheck,
  LaneReachesCheck,
  MinScreenSizeCheck,
  VisibleCheck,
} from "../types";

const TIMES = "\u00d7";

/** The row label of a check in `compare` (SPEC section 11.1). `unit` is the scene's unit name. */
export function checkLabel(spec: CheckSpec, base: CheckResult, unit: string): string {
  switch (spec.check) {
    case "in_region": {
      const s = spec as InRegionCheck;
      const where = `${s.region}${s.strip === undefined ? "" : `/${s.strip}`}`;
      return `in_region ${where}${s.measure === "drawn" ? " drawn" : ""} (objects outside)`;
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
    case "lane_reaches": {
      const s = spec as LaneReachesCheck;
      const axis = s.edge === "top" || s.edge === "bottom" ? "x" : "y";
      return `lane_reaches ${s.lane} (${axis} px)`;
    }
    case "lane_apart": {
      const s = spec as LaneApartCheck;
      const target = s.target.replace(/^(?:lane|zone):/, "");
      return `lane_apart ${s.lane}${TIMES}${target} (${unit})`;
    }
    case "visible":
      return `visible ${(spec as VisibleCheck).target} (% occluded)`;
    case "reachable":
      return `reachable ${spec.id} (${unit})`;
    case "capacity":
      return `capacity ${spec.id} (usable ${(spec as CapacityCheck).kind})`;
    case "min_screen_size": {
      const s = spec as MinScreenSizeCheck;
      return `min_screen_size ${s.target}${s.measure === "height" ? " height" : ""} (px)`;
    }
    case "sort_consistency":
      return `sort_consistency ${spec.id} (objects out of order)`;
    case "visible_share":
      return `visible_share ${spec.id} (% shown)`;
    default:
      return `${spec.check} ${spec.id}`;
  }
}
