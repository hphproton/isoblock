import { EPS, footprint, sizeBox, type Box, type Rect } from "../geometry";
import { orderDirection } from "../projection";
import { round } from "../round";
import { actorWorst, prepareActor, prepareSprites, staticWorst, type PreparedSprite } from "../sort/mismatch";
import { actorOrderWorst, actorSlot, orderPairWorst } from "../sort/orderRule";
import { spriteOrders } from "../sort/staticOrder";
import { sceneSprites, sortKey, type Sprite } from "../sort/sprites";
import type { CheckResult, Scene, SortConsistencyCheck, Vec2, Vec3 } from "../types";
import { skipResult } from "./result";
import { eachActorPosition, searchCells, type ActorGround, type ActorSearch } from "./sortPositions";
import { MAX_CELLS } from "./walkGrid";

const DEFAULT_STEP = 0.1;
const DEFAULT_REACH = 1;

/**
 * The ground of the check: any ground without `area`; with `area`, the polygon of that zone minus
 * the blocked zones that have 3 or more points.
 */
function groundOf(scene: Scene, area: string | undefined, level: number): ActorGround | string {
  if (area === undefined) return { area: null, blocked: [] };
  const zones = scene.zones ?? [];
  const points = zones.find((z) => z.id === area)?.points ?? [];
  if (points.length < 3) return `zone "${area}" has ${points.length} points; an area needs 3 or more`;
  const blocked = zones
    .filter((z) => z.kind === "blocked" && Math.abs((z.h ?? 0) - level) <= EPS && (z.points ?? []).length >= 3)
    .map((z) => z.points as readonly Vec2[]);
  return { area: points, blocked };
}

type Pair = readonly [string, string];

function comparePairs(a: Pair, b: Pair): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return 0;
}

/**
 * The largest static wrong area of each object, and the object pairs over `maxPixels` (SPEC 9.9).
 * `ids` is the file order of `objects`.
 */
function orderStatic(
  objects: readonly (readonly PreparedSprite[])[],
  ids: readonly string[],
  wanted: ReadonlySet<number>,
  maxPixels: number,
  c: Vec3,
): { readonly worst: readonly number[]; readonly pairs: Pair[] } {
  const worst = objects.map(() => 0);
  const pairs: Pair[] = [];
  for (let x = 0; x < objects.length; x++) {
    for (let y = x + 1; y < objects.length; y++) {
      if (!wanted.has(x) && !wanted.has(y)) continue;
      const area = orderPairWorst(objects[x] as readonly PreparedSprite[], objects[y] as readonly PreparedSprite[], c);
      worst[x] = Math.max(worst[x] as number, area);
      worst[y] = Math.max(worst[y] as number, area);
      if (area <= maxPixels + EPS) continue;
      const a = ids[x] as string;
      const b = ids[y] as string;
      pairs.push(a < b ? [a, b] : [b, a]);
    }
  }
  pairs.sort(comparePairs);
  return { worst, pairs };
}

/**
 * An engine draws a test actor and the objects in their geometric order (SPEC 9.3, 9.9).
 * `engine: "key"` sorts one key per sprite. `engine: "order"` draws scene sprites by their static
 * order and places the actor at its slot. `source` is the scene without states, whose static
 * orders stay when a state hides objects or parts. The value is the number of examined objects
 * whose largest area drawn in the wrong order exceeds `maxPixels`.
 */
export function checkSortConsistency(scene: Scene, spec: SortConsistencyCheck, source: Scene = scene): CheckResult {
  const level = spec.level ?? 0;
  const ground = groundOf(scene, spec.area, level);
  if (typeof ground === "string") return skipResult(spec, ground);
  const step = spec.step ?? DEFAULT_STEP;
  const wanted = spec.ids === undefined ? null : new Set(spec.ids);
  const examined = scene.objects.flatMap((o, i) => (wanted === null || wanted.has(o.id) ? [i] : []));
  const footprints = scene.objects.map((o) => footprint(scene, o));
  const search: ActorSearch = {
    actor: spec.actor, step, reach: spec.reach ?? DEFAULT_REACH, ground, level, obstacles: scene.objects.map((o) => sizeBox(scene, o)),
  };
  const tooBig = examined.find((i) => searchCells(footprints[i] as Rect, search) > MAX_CELLS);
  if (tooBig !== undefined) {
    return skipResult(spec, `the search around "${scene.objects[tooBig]?.id}" has more than ${MAX_CELLS} cells; use a larger step`);
  }
  const c = orderDirection(scene.camera);
  const rule = spec.engine ?? "key";
  const orders = rule === "order" ? spriteOrders(source, c) : null;
  const groups = sceneSprites(scene);
  const prepared = scene.objects.map((object, index) => {
    const sprites = (groups[index] ?? []).map((sprite, slice) => numbered(sprite, orders?.get(object.id)?.[slice]));
    return prepareSprites(sprites, scene.camera, c);
  });
  const maxPixels = spec.maxPixels ?? 0;
  const chosen = new Set(examined);
  const ranked = rule === "order"
    ? orderStatic(prepared, scene.objects.map((object) => object.id), chosen, maxPixels, c)
    : { worst: staticWorst(prepared, chosen, c), pairs: null };
  const drawn = prepared.flat();
  let positions = 0;
  const worst = examined.map((i) => {
    let largest = ranked.worst[i] as number;
    const own = prepared[i] as readonly PreparedSprite[];
    eachActorPosition(footprints[i] as Rect, search, (f) => {
      positions += 1;
      const box: Box = { ...f, h0: level, h1: level + spec.actor[2] };
      const actor = prepareActor(box, sortKey(c, f, level), scene.camera, c);
      const area = rule === "order" ? actorOrderWorst(own, actor, actorSlot(drawn, actor, c), c) : actorWorst(own, actor, c);
      largest = Math.max(largest, area);
    });
    return largest;
  });
  const failing = examined.filter((_, k) => (worst[k] as number) > maxPixels + EPS);
  const largest = round(worst.reduce((a, b) => Math.max(a, b), 0), 2);
  return {
    id: spec.id,
    check: spec.check,
    status: failing.length > 0 ? "fail" : "pass",
    value: failing.length,
    threshold: 0,
    ids: failing.map((i) => (scene.objects[i] as { id: string }).id),
    ...(ranked.pairs === null ? {} : { pairs: ranked.pairs }),
    worst: largest,
    positions,
    message: `objects drawn out of order: ${failing.length} of ${examined.length}, worst ${largest.toFixed(2)} px2 (max ${maxPixels}), ${positions} actor positions`,
  };
}

function numbered(sprite: Sprite, order: number | undefined): Sprite {
  return order === undefined ? sprite : { ...sprite, order };
}
