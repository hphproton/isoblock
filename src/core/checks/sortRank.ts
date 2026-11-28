import { EPS } from "../geometry";
import { keyPairWorst, type PreparedSprite } from "../sort/mismatch";
import { orderPairWorst } from "../sort/orderRule";
import type { Vec3 } from "../types";
import { noteStatic, staticSides, type Allowance } from "./sortAllow";

type Pair = readonly [string, string];

function comparePairs(a: Pair, b: Pair): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return 0;
}

/**
 * The largest static wrong area of each object, and, for the order rule, the pairs over
 * `maxPixels` (SPEC 9.3, 9.9, 9.10). An `allow` entry drops the sides it names.
 */
export function rankStatic(
  objects: readonly (readonly PreparedSprite[])[],
  ids: readonly string[],
  wanted: ReadonlySet<number>,
  maxPixels: number,
  c: Vec3,
  rule: "key" | "order",
  allowance: Allowance | null,
): { readonly worst: readonly number[]; readonly pairs: Pair[] | null } {
  const worst = objects.map(() => 0);
  const pairs: Pair[] = [];
  for (let x = 0; x < objects.length; x++) {
    for (let y = x + 1; y < objects.length; y++) {
      if (!wanted.has(x) && !wanted.has(y)) continue;
      const left = objects[x] as readonly PreparedSprite[];
      const right = objects[y] as readonly PreparedSprite[];
      const area = rule === "order" ? orderPairWorst(left, right, c) : keyPairWorst(x, left, y, right, c);
      const a = ids[x] as string;
      const b = ids[y] as string;
      noteStatic(allowance, a, b, area, maxPixels);
      const sides = staticSides(allowance, a, b);
      if (sides.a) worst[x] = Math.max(worst[x] as number, area);
      if (sides.b) worst[y] = Math.max(worst[y] as number, area);
      if (rule !== "order" || !(area > maxPixels + EPS)) continue;
      if ((wanted.has(x) && sides.a) || (wanted.has(y) && sides.b)) pairs.push(a < b ? [a, b] : [b, a]);
    }
  }
  pairs.sort(comparePairs);
  return { worst, pairs: rule === "order" ? pairs : null };
}
