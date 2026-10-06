import { rectGap, type Rect } from "../geometry";
import { fmt } from "../format";
import { laneShape } from "../checks/laneShape";
import { band, bandMessage, overlapAmount, SATISFIED, type Band, type Measure, type Rects } from "./shared";
import { wrongTarget, type Target } from "./targets";

/** Distance from footprint `a` to a target, and the overlap with it (0 for a strip edge). */
interface Reach {
  readonly distance: (rects: Rects) => number;
  readonly overlap: (rects: Rects) => number;
}

/**
 * Distance to a target (SPEC section 7): to an object, the `clearance` distance; to a lane, the
 * `clearance` distance to the lane rectangle; to a strip edge, the distance to the line v = bound.
 * Returns the reason when the target cannot be measured.
 */
function reachOf(a: number, target: Target, kinds: readonly Target["kind"][]): Reach | string {
  if (!kinds.includes(target.kind)) return wrongTarget("b", kinds, target);
  if (target.kind === "object") {
    const b = target.index;
    return { distance: (rects) => rectGap(rects[a] as Rect, rects[b] as Rect), overlap: (rects) => overlapAmount(rects[a] as Rect, rects[b] as Rect) };
  }
  if (target.kind === "lane") {
    const shape = laneShape(target.lane);
    if (!shape.ok) return shape.reason;
    const lane = shape.rect;
    return { distance: (rects) => rectGap(rects[a] as Rect, lane), overlap: (rects) => overlapAmount(rects[a] as Rect, lane) };
  }
  if (target.kind === "strip" && target.bound !== null) {
    const c = target.bound;
    return { distance: (rects) => Math.max(0, (rects[a] as Rect).v0 - c, c - (rects[a] as Rect).v1), overlap: () => 0 };
  }
  return `${target.name} is unbounded`;
}

/** `gap` (object targets) and `against` (object, lane or strip edge): band violation of the distance. */
export function bandDistanceMeasure(a: number, target: Target, gap: Band, kinds: readonly Target["kind"][]): Measure | string {
  const reach = reachOf(a, target, kinds);
  if (typeof reach === "string") return reach;
  return {
    violation: (rects) => band(reach.distance(rects), gap),
    message: (rects) => bandMessage("distance", reach.distance(rects), gap),
  };
}

/** `clear_of` (object or lane): `max(0, min - distance) + overlap`. */
export function clearOfMeasure(a: number, target: Target, min: number): Measure | string {
  const reach = reachOf(a, target, ["object", "lane"]);
  if (typeof reach === "string") return reach;
  const violation = (rects: Rects) => Math.max(0, min - reach.distance(rects)) + reach.overlap(rects);
  return {
    violation,
    message: (rects) => {
      const overlap = reach.overlap(rects);
      const v = violation(rects);
      const extra = overlap > 0 ? `, overlap ${fmt(overlap)}` : "";
      return `distance ${fmt(reach.distance(rects))}${extra}, wanted >= ${fmt(min)}${v > SATISFIED ? ` (violation ${fmt(v)})` : ""}`;
    },
  };
}
