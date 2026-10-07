import { EPS, footprint, type Rect } from "../geometry";
import type { CheckResult, ReachableCheck, Scene, Vec2 } from "../types";
import { resolvePoint, type ResolvedPoint } from "./points";
import { inObjectOrder, round6, skipResult } from "./result";
import { buildGrid, MAX_CELLS, nearestFree, shortestMoves } from "./walkGrid";

const DEFAULT_RADIUS = 0.2;
const DEFAULT_STEP = 0.1;

type Polygons = readonly (readonly Vec2[])[];

/** The polygon of `area`, else every walkable zone with 3 or more points; a message when there is none. */
function walkableAreas(scene: Scene, area: string | undefined): Polygons | string {
  const zones = scene.zones ?? [];
  if (area !== undefined) {
    const points = zones.find((z) => z.id === area)?.points ?? [];
    return points.length >= 3 ? [points] : `zone "${area}" has ${points.length} points; a walkable area needs 3 or more`;
  }
  const polygons = zones.filter((z) => z.kind === "walkable" && (z.points ?? []).length >= 3).map((z) => z.points as readonly Vec2[]);
  return polygons.length > 0 ? polygons : 'the scene has no zone with kind "walkable"';
}

function blockedAreas(scene: Scene): Polygons {
  return (scene.zones ?? []).filter((z) => z.kind === "blocked" && (z.points ?? []).length >= 3).map((z) => z.points as readonly Vec2[]);
}

/** Footprints of the objects that block the path: all except those in `ignore` and those the points name. */
function obstacles(scene: Scene, spec: ReachableCheck, named: ReadonlySet<string>): readonly Rect[] {
  const skipped = new Set([...(spec.ignore ?? []), ...named]);
  return scene.objects.filter((o) => !skipped.has(o.id)).map((o) => footprint(scene, o));
}

function failure(spec: ReachableCheck, ids: readonly string[], message: string): CheckResult {
  return { id: spec.id, check: spec.check, status: "fail", value: null, threshold: spec.max ?? null, ids, message };
}

/**
 * A walkable path exists from `from` to `to` on a grid of free cells (SPEC section 9.2). The value
 * is the number of moves times `step`; with `max` the path may not be longer.
 */
export function checkReachable(scene: Scene, spec: ReachableCheck): CheckResult {
  const from = resolvePoint(scene, spec.from, "first");
  const to = resolvePoint(scene, spec.to, "last");
  if (from === null || to === null) return skipResult(spec, "a point of the check does not resolve");
  const areas = walkableAreas(scene, spec.area);
  if (typeof areas === "string") return skipResult(spec, areas);
  const named = new Set([from, to].map((p: ResolvedPoint) => p.object).filter((id): id is string => id !== null));
  const ids = inObjectOrder(scene, named);
  const step = spec.step ?? DEFAULT_STEP;
  const grid = buildGrid({
    step,
    radius: spec.radius ?? DEFAULT_RADIUS,
    walkable: areas,
    blocked: blockedAreas(scene),
    obstacles: obstacles(scene, spec, named),
  });
  if (grid === null) return skipResult(spec, `the grid has more than ${MAX_CELLS} cells; use a larger step`);
  const start = nearestFree(grid, from.at);
  if (start === null || start.distance > step + EPS) return failure(spec, ids, "start is not on walkable ground");
  const target = nearestFree(grid, to.at);
  if (target === null || target.distance > step + EPS) return failure(spec, ids, "target is not on walkable ground");
  const moves = shortestMoves(grid, start.cell, target.cell);
  if (moves < 0) return failure(spec, ids, "no walkable path");
  const value = round6(moves * step);
  const ok = spec.max === undefined || value <= spec.max + EPS;
  return {
    id: spec.id,
    check: spec.check,
    status: ok ? "pass" : "fail",
    value,
    threshold: spec.max ?? null,
    ids,
    message: `path of ${value.toFixed(2)} ${scene.units.name}${spec.max === undefined ? "" : ` (max ${spec.max.toFixed(2)})`}`,
  };
}
