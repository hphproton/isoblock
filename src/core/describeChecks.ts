import { fmt, percent, plain } from "./format";
import type {
  CheckResult,
  CheckSpec,
  ClearanceCheck,
  InRegionCheck,
  LaneClearCheck,
  LaneReachesCheck,
  Scene,
} from "./types";

const TIMES = "\u00d7";
const APPROX = "\u2248";

function join(items: readonly string[]): string {
  return items.join(", ");
}

/** Text after `<STATUS> <id> <check> `, per the templates of SPEC Appendix B. */
function body(spec: CheckSpec, r: CheckResult): string {
  switch (spec.check) {
    case "in_region": {
      const s = spec as InRegionCheck;
      return `${join(r.ids)}: outside ${s.strip === undefined ? s.region : `${s.region}/${s.strip}`}`;
    }
    case "no_overlap": {
      const pairs = (r.pairs ?? []).map((p) => `${p[0]}${TIMES}${p[1]}`);
      return `${join(pairs)}: ${r.value} overlapping pairs`;
    }
    case "clearance": {
      const s = spec as ClearanceCheck;
      return `${r.ids.join(TIMES)}: gap ${fmt(r.value ?? 0)} < ${fmt(s.min)}`;
    }
    case "lane_clear":
      return `${(spec as LaneClearCheck).lane}: blocked by ${join(r.ids)}`;
    case "lane_reaches": {
      const s = spec as LaneReachesCheck;
      if (r.value === null) return `${s.lane}: does not reach ${s.edge} edge`;
      const [y0, y1] = r.threshold as readonly [number, number];
      return `${s.lane}: meets ${s.edge} edge at y${APPROX}${Math.round(r.value)} (${s.region} y ${plain(y0)}-${plain(y1)})`;
    }
    case "visible": {
      const who = r.occluders ?? [];
      return `${r.ids[0]}: ${percent(r.value ?? 0)}% occluded${who.length > 0 ? ` (${join(who)})` : ""}`;
    }
    default:
      return r.message;
  }
}

/** One line per failing, warning or skipped check, in `checks` order. */
export function checkLines(scene: Scene, results: readonly CheckResult[]): string[] {
  const specs = new Map((scene.checks ?? []).map((c) => [c.id, c]));
  return results.flatMap((r) => {
    if (r.status === "pass") return [];
    const spec = specs.get(r.id);
    const label = r.status.toUpperCase();
    if (r.status === "skip" || spec === undefined) return [`${label} ${r.id} ${r.check}: ${r.message}`];
    return [`${label} ${r.id} ${r.check} ${body(spec, r)}`];
  });
}
