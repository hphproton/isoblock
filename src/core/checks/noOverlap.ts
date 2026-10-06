import { footprint, rectsOverlap } from "../geometry";
import type { CheckResult, NoOverlapCheck, Scene } from "../types";
import { plural, selectObjects } from "./result";

type Pair = readonly [string, string];

function sortedPair(a: string, b: string): Pair {
  return a < b ? [a, b] : [b, a];
}

function pairKey(pair: Pair): string {
  return `${pair[0]}\u0000${pair[1]}`;
}

function comparePairs(x: Pair, y: Pair): number {
  if (x[0] !== y[0]) return x[0] < y[0] ? -1 : 1;
  if (x[1] !== y[1]) return x[1] < y[1] ? -1 : 1;
  return 0;
}

/** Footprints must not overlap, except declared pairs. */
export function checkNoOverlap(scene: Scene, spec: NoOverlapCheck): CheckResult {
  const objects = selectObjects(scene, spec.ids);
  const allowed = new Set((spec.allow ?? []).map(([a, b]) => pairKey(sortedPair(a, b))));
  const rects = objects.map((o) => footprint(scene, o));
  const pairs: Pair[] = [];
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      const pair = sortedPair((objects[i] as { id: string }).id, (objects[j] as { id: string }).id);
      if (rectsOverlap(rects[i]!, rects[j]!) && !allowed.has(pairKey(pair))) pairs.push(pair);
    }
  }
  pairs.sort(comparePairs);
  const ids = [...new Set(pairs.flat())].sort();
  return {
    id: spec.id,
    check: spec.check,
    status: pairs.length === 0 ? "pass" : "fail",
    value: pairs.length,
    threshold: 0,
    ids,
    pairs,
    message:
      pairs.length === 0
        ? "no overlapping footprints"
        : `${plural(pairs.length, "overlapping pair", "overlapping pairs")}: ${pairs.map((p) => `${p[0]}\u00d7${p[1]}`).join(", ")}`,
  };
}
