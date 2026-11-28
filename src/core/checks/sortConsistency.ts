import { EPS, footprint, type Rect } from "../geometry";
import { orderDirection } from "../projection";
import { round } from "../round";
import { prepareSprites } from "../sort/mismatch";
import { spriteOrders } from "../sort/staticOrder";
import { sceneSprites, type Sprite } from "../sort/sprites";
import type { CheckResult, Scene, SortConsistencyCheck, Vec2 } from "../types";
import { skipResult } from "./result";
import { allowedEntries, buildAllowance, type Allowance } from "./sortAllow";
import { countLanes } from "./sortLanes";
import { type PositionRank, type SortPass } from "./sortMeasure";
import { rankStatic } from "./sortRank";
import { obstacleBoxes, searchCells, type ActorGround, type ActorSearch } from "./sortPositions";
import { countGrid } from "./sortWalk";
import { MAX_CELLS } from "./walkGrid";

const DEFAULT_STEP = 0.1;
const DEFAULT_REACH = 1;

/** Blocked zones at `level` with 3 or more points. */
function blockedPolygons(scene: Scene, level: number): readonly (readonly Vec2[])[] {
  return (scene.zones ?? [])
    .filter((z) => z.kind === "blocked" && Math.abs((z.h ?? 0) - level) <= EPS && (z.points ?? []).length >= 3)
    .map((z) => z.points as readonly Vec2[]);
}

/**
 * The ground of the check. With `area`, that zone minus the blocked zones at `level` (SPEC 9.3, 9.5).
 * Without `area`, a check that sets `parts` or `edges` also refuses those blocked zones (SPEC 9.10);
 * a check that sets neither keeps the open ground of release 0.16.0.
 */
function groundOf(scene: Scene, area: string | undefined, level: number, refuseBlocked: boolean): ActorGround | string {
  const blocked = area !== undefined || refuseBlocked ? blockedPolygons(scene, level) : [];
  if (area === undefined) return { area: null, blocked };
  const points = (scene.zones ?? []).find((z) => z.id === area)?.points ?? [];
  if (points.length < 3) return `zone "${area}" has ${points.length} points; an area needs 3 or more`;
  return { area: points, blocked };
}

type Pair = readonly [string, string];

function finish(
  spec: SortConsistencyCheck,
  scene: Scene,
  examined: readonly number[],
  worst: readonly number[],
  positions: number,
  pairs: readonly Pair[] | null,
  allowance: Allowance | null,
): CheckResult {
  const maxPixels = spec.maxPixels ?? 0;
  const failing = examined.filter((_, k) => (worst[k] as number) > maxPixels + EPS);
  const largest = round(worst.reduce((a, b) => Math.max(a, b), 0), 2);
  const allowed = allowance === null ? undefined : allowedEntries(allowance);
  return {
    id: spec.id,
    check: spec.check,
    status: failing.length > 0 ? "fail" : "pass",
    value: failing.length,
    threshold: 0,
    ids: failing.map((i) => (scene.objects[i] as { id: string }).id),
    ...(pairs === null ? {} : { pairs }),
    worst: largest,
    positions,
    ...(allowed === undefined ? {} : { allowed }),
    message: `objects drawn out of order: ${failing.length} of ${examined.length}, worst ${largest.toFixed(2)} px2 (max ${maxPixels}), ${positions} actor positions`,
  };
}

function numbered(sprite: Sprite, order: number | undefined): Sprite {
  return order === undefined ? sprite : { ...sprite, order };
}

/**
 * An engine draws a test actor and the objects in their geometric order (SPEC 9.3, 9.9, 9.10).
 * `engine: "key"` sorts one key per sprite. `engine: "order"` draws scene sprites by their static
 * order and places the actor at its slot. `source` is the scene without states, whose static
 * orders stay when a state hides objects or parts. The value is the number of examined objects
 * whose largest area drawn in the wrong order exceeds `maxPixels`.
 */
export function checkSortConsistency(scene: Scene, spec: SortConsistencyCheck, source: Scene = scene): CheckResult {
  const step = spec.step ?? DEFAULT_STEP;
  const reach = spec.reach ?? DEFAULT_REACH;
  const level = spec.level ?? 0;
  const onLanes = spec.lanes !== undefined;
  const ground = onLanes ? { area: null, blocked: [] } : groundOf(scene, spec.area, level, spec.parts === true || spec.edges === true);
  if (typeof ground === "string") return skipResult(spec, ground);
  const wanted = spec.ids === undefined ? null : new Set(spec.ids);
  const examined = scene.objects.flatMap((object, index) => (wanted === null || wanted.has(object.id) ? [index] : []));
  const footprints = scene.objects.map((object) => footprint(scene, object));
  const obstacles = obstacleBoxes(scene, spec.parts === true);
  const search: ActorSearch | null = onLanes ? null : { actor: spec.actor, step, reach, ground, level, obstacles };
  if (search !== null) {
    const tooBig = examined.find((index) => searchCells(footprints[index] as Rect, search) > MAX_CELLS);
    if (tooBig !== undefined) {
      return skipResult(spec, `the search around "${scene.objects[tooBig]?.id}" has more than ${MAX_CELLS} cells; use a larger step`);
    }
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
  const allowance = buildAllowance(spec.allow);
  const ranked = rankStatic(prepared, scene.objects.map((object) => object.id), new Set(examined), maxPixels, c, rule, allowance);
  const pass: SortPass = {
    scene, spec, examined, footprints, prepared, drawn: prepared.flat(), c, rule,
    base: ranked.worst, allowance, maxPixels, obstacles, step, reach, search,
  };
  const walked: PositionRank | CheckResult = onLanes ? countLanes(pass) : countGrid(pass);
  if ("status" in walked) return walked;
  return finish(spec, scene, examined, walked.worst, walked.positions, ranked.pairs, allowance);
}
