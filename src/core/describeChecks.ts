import { fmt, percent, plain } from "./format";
import { EPS } from "./geometry";
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
  ReachableCheck,
  Scene,
  VisibleCheck,
  VisibleShareCheck,
} from "./types";

const TIMES = "\u00d7";
const APPROX = "\u2248";

function join(items: readonly string[]): string {
  return items.join(", ");
}

/** Whole number, halves up (SPEC Appendix B, warning lines). */
function whole(n: number): number {
  return Math.floor(n + 0.5 + EPS);
}

function percentUp(fraction: number): number {
  return whole(fraction * 100);
}

/** The text after `WARN <id> <check> ` (SPEC Appendix B). */
function warnBody(scene: Scene, spec: CheckSpec, r: CheckResult): string {
  const warn = "warn" in spec && typeof (spec as { warn?: number }).warn === "number" ? (spec as { warn: number }).warn : 0;
  switch (spec.check) {
    case "clearance": {
      const s = spec as ClearanceCheck;
      return `${r.ids.join(TIMES)}: gap ${fmt(r.value ?? 0)}, within ${fmt(warn)} of ${fmt(s.min)}`;
    }
    case "lane_apart": {
      const s = spec as LaneApartCheck;
      const target = s.target.replace(/^(?:lane|zone):/, "");
      return `${s.lane}${TIMES}${target}: ${fmt(r.value ?? 0)}, within ${fmt(warn)} of ${fmt(s.min ?? 0)}`;
    }
    case "visible": {
      const s = spec as VisibleCheck;
      return `${r.ids[0]}: ${percentUp(r.value ?? 0)}% occluded, within ${percentUp(warn)}% of ${percentUp(s.maxOccluded)}%`;
    }
    case "reachable": {
      const s = spec as ReachableCheck;
      const who = join(r.ids) || "path";
      return `${who}: path of ${fmt(r.value ?? 0)} ${scene.units.name}, within ${fmt(warn)} of ${fmt(s.max ?? 0)}`;
    }
    case "capacity": {
      const s = spec as CapacityCheck;
      return `${s.kind}: ${plain(r.value ?? 0)} usable, within ${plain(warn)} of ${plain(s.min)}`;
    }
    case "min_screen_size": {
      const s = spec as MinScreenSizeCheck;
      const tall = s.measure === "height" ? " px tall" : " px";
      return `${s.target}: ${whole(r.value ?? 0)}${tall}, within ${whole(warn)} px of ${whole(s.min)} px`;
    }
    case "visible_share": {
      const s = spec as VisibleShareCheck;
      return `${join(r.ids)}: ${percentUp(r.value ?? 0)}% shown, within ${percentUp(warn)}% of ${percentUp(s.min)}%`;
    }
    default:
      return r.message;
  }
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
    case "lane_apart": {
      const s = spec as LaneApartCheck;
      const target = s.target.replace(/^(?:lane|zone):/, "");
      if ((r.overlap ?? 0) > EPS) return `${s.lane}${TIMES}${target}: overlap ${fmt(r.overlap ?? 0)}`;
      return `${s.lane}${TIMES}${target}: ${fmt(r.value ?? 0)} < ${fmt(s.min ?? 0)}`;
    }
    case "lane_reaches": {
      const s = spec as LaneReachesCheck;
      if (r.value === null) return `${s.lane}: does not reach ${s.edge} edge`;
      const horizontal = s.edge === "top" || s.edge === "bottom";
      const axis = horizontal ? "x" : "y";
      const [a, b] = r.threshold as readonly [number, number];
      return `${s.lane}: meets ${s.edge} edge at ${axis}${APPROX}${Math.round(r.value)} (${s.region} ${axis} ${plain(a)}-${plain(b)})`;
    }
    case "visible": {
      const who = r.occluders ?? [];
      return `${r.ids[0]}: ${percent(r.value ?? 0)}% occluded${who.length > 0 ? ` (${join(who)})` : ""}`;
    }
    case "reachable":
      return `${join(r.ids) || "path"}: ${r.message}`;
    case "capacity":
      return `${(spec as CapacityCheck).kind}: ${r.value ?? 0} usable < ${r.threshold as number}${(r.rejected ?? []).length > 0 ? ` (blocked: ${join(r.rejected ?? [])})` : ""}`;
    case "min_screen_size": {
      const s = spec as MinScreenSizeCheck;
      if (s.measure === "height") return `${s.target}: ${plain(r.value ?? 0)} px tall < ${plain(s.min)} px`;
      return `${s.target}: ${Math.round(r.value ?? 0)} px < ${plain(s.min)} px`;
    }
    case "sort_consistency":
      return `${join(r.ids)}: drawn out of order, worst ${(r.worst ?? 0).toFixed(2)} px2`;
    case "visible_share":
      return `${join(r.ids)}: ${percent(r.value ?? 0)}% shown`;
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
    if (r.status === "warn" && spec !== undefined) return [`WARN ${r.id} ${r.check} ${warnBody(scene, spec, r)}`];
    if (r.status === "skip" || spec === undefined) return [`${label} ${r.id} ${r.check}: ${r.message}`];
    return [`${label} ${r.id} ${r.check} ${body(spec, r)}`];
  });
}
