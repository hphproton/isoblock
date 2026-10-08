import { EPS, footprint, type Box, type Rect } from "../geometry";
import { orderDirection } from "../projection";
import { round } from "../round";
import { actorWorst, prepareActor, prepareSprites, staticWorst, type PreparedSprite } from "../sort/mismatch";
import { sceneSprites, sortKey } from "../sort/sprites";
import type { CheckResult, Scene, SortConsistencyCheck, Vec2 } from "../types";
import { skipResult } from "./result";
import { eachActorPosition, searchCells, type ActorGround, type ActorSearch } from "./sortPositions";
import { MAX_CELLS } from "./walkGrid";

const DEFAULT_STEP = 0.1;
const DEFAULT_REACH = 1;

/**
 * The ground of the check: any ground without `area`; with `area`, the polygon of that zone minus
 * the blocked zones that have 3 or more points.
 */
function groundOf(scene: Scene, area: string | undefined): ActorGround | string {
  if (area === undefined) return { area: null, blocked: [] };
  const zones = scene.zones ?? [];
  const points = zones.find((z) => z.id === area)?.points ?? [];
  if (points.length < 3) return `zone "${area}" has ${points.length} points; an area needs 3 or more`;
  const blocked = zones.filter((z) => z.kind === "blocked" && (z.points ?? []).length >= 3).map((z) => z.points as readonly Vec2[]);
  return { area: points, blocked };
}

/**
 * An engine that sorts one key per sprite (SPEC 13.4) draws a test actor and the objects in their
 * geometric order (SPEC 9.3). The value is the number of examined objects whose largest area
 * drawn in the wrong order, against the actor or against another object, exceeds `maxPixels`.
 */
export function checkSortConsistency(scene: Scene, spec: SortConsistencyCheck): CheckResult {
  const ground = groundOf(scene, spec.area);
  if (typeof ground === "string") return skipResult(spec, ground);
  const step = spec.step ?? DEFAULT_STEP;
  const wanted = spec.ids === undefined ? null : new Set(spec.ids);
  const examined = scene.objects.flatMap((o, i) => (wanted === null || wanted.has(o.id) ? [i] : []));
  const footprints = scene.objects.map((o) => footprint(scene, o));
  const search: ActorSearch = { actor: spec.actor, step, reach: spec.reach ?? DEFAULT_REACH, ground, obstacles: footprints };
  const tooBig = examined.find((i) => searchCells(footprints[i] as Rect, search) > MAX_CELLS);
  if (tooBig !== undefined) {
    return skipResult(spec, `the search around "${scene.objects[tooBig]?.id}" has more than ${MAX_CELLS} cells; use a larger step`);
  }
  const c = orderDirection(scene.camera);
  const prepared = sceneSprites(scene).map((sprites) => prepareSprites(sprites, scene.camera, c));
  const statics = staticWorst(prepared, new Set(examined), c);
  let positions = 0;
  const worst = examined.map((i) => {
    let largest = statics[i] as number;
    eachActorPosition(footprints[i] as Rect, search, (f) => {
      positions += 1;
      const box: Box = { ...f, h0: 0, h1: spec.actor[2] };
      largest = Math.max(largest, actorWorst(prepared[i] as readonly PreparedSprite[], prepareActor(box, sortKey(c, f), scene.camera, c), c));
    });
    return largest;
  });
  const maxPixels = spec.maxPixels ?? 0;
  const failing = examined.filter((_, k) => (worst[k] as number) > maxPixels + EPS);
  const largest = round(worst.reduce((a, b) => Math.max(a, b), 0), 2);
  return {
    id: spec.id,
    check: spec.check,
    status: failing.length > 0 ? "fail" : "pass",
    value: failing.length,
    threshold: 0,
    ids: failing.map((i) => (scene.objects[i] as { id: string }).id),
    worst: largest,
    positions,
    message: `objects drawn out of order: ${failing.length} of ${examined.length}, worst ${largest.toFixed(2)} px2 (max ${maxPixels}), ${positions} actor positions`,
  };
}
