import { footprint, rectsOverlap, type Rect } from "../geometry";
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

function allowedKeys(spec: NoOverlapCheck): ReadonlySet<string> {
  return new Set((spec.allow ?? []).map(([a, b]) => pairKey(sortedPair(a, b))));
}

function resultOf(spec: NoOverlapCheck, pairs: Pair[]): CheckResult {
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

/** Footprints must not overlap, except declared pairs. */
export function checkNoOverlap(scene: Scene, spec: NoOverlapCheck): CheckResult {
  const objects = selectObjects(scene, spec.ids);
  const allowed = allowedKeys(spec);
  const rects = objects.map((o) => footprint(scene, o));
  const pairs: Pair[] = [];
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      if (!rectsOverlap(rects[i]!, rects[j]!)) continue;
      const pair = sortedPair((objects[i] as { id: string }).id, (objects[j] as { id: string }).id);
      if (!allowed.has(pairKey(pair))) pairs.push(pair);
    }
  }
  return resultOf(spec, pairs);
}

/**
 * The result for `scene`, from the result for the scene before it, when only the objects in
 * `changed` differ: pairs of unchanged objects are kept, and every changed object is compared with
 * all the others. Equal to `checkNoOverlap`.
 */
export function updateNoOverlap(scene: Scene, spec: NoOverlapCheck, prev: CheckResult, changed: ReadonlySet<string>): CheckResult {
  const objects = selectObjects(scene, spec.ids);
  const allowed = allowedKeys(spec);
  const pairs = (prev.pairs ?? []).filter(([a, b]) => !changed.has(a) && !changed.has(b));
  const seen = new Set(pairs.map(pairKey));
  const rects = new Map<string, Rect>(objects.map((o) => [o.id, footprint(scene, o)]));
  for (const moved of objects) {
    if (!changed.has(moved.id)) continue;
    const rect = rects.get(moved.id) as Rect;
    for (const other of objects) {
      if (other.id === moved.id || !rectsOverlap(rect, rects.get(other.id) as Rect)) continue;
      const pair = sortedPair(moved.id, other.id);
      const key = pairKey(pair);
      if (allowed.has(key) || seen.has(key)) continue;
      seen.add(key);
      pairs.push(pair);
    }
  }
  return resultOf(spec, pairs);
}
