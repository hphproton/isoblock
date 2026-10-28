import { EPS, footprint, sizeBox, takesSpace, type Rect } from "../geometry";
import type { CheckResult, Lane, ReachableCheck, Scene, Vec2 } from "../types";
import { resolvePoint } from "./points";
import { lanePieces, objectBlocksLane } from "./lanePieces";
import { pointHeight } from "./laneShape";
import { marginStatus } from "./margin";
import { inObjectOrder, round6, skipResult } from "./result";
import { addGridEdges, edgeList, shortestCost, type LevelEdges } from "./levelPath";
import { buildGrid, MAX_CELLS, nearestFree, type Grid } from "./walkGrid";

const DEFAULT_RADIUS = 0.2;
const DEFAULT_STEP = 0.1;

interface Level {
  readonly grid: Grid | null;
}

function heightsOf(scene: Scene, spec: ReachableCheck): number[] {
  const heights: number[] = [];
  const add = (h: number): void => {
    if (!heights.some((item) => Math.abs(item - h) <= EPS)) heights.push(h);
  };
  add(spec.level ?? 0);
  add(spec.toLevel as number);
  for (const zone of scene.zones ?? []) {
    if (zone.kind === "walkable" && (zone.points ?? []).length >= 3) add(zone.h ?? 0);
  }
  return heights;
}

function levelIndex(heights: readonly number[], h: number): number {
  return heights.findIndex((item) => Math.abs(item - h) <= EPS);
}

function polygons(scene: Scene, kind: string, level: number): readonly (readonly Vec2[])[] {
  return (scene.zones ?? []).flatMap((zone) => {
    const points = zone.points ?? [];
    if (zone.kind !== kind || points.length < 3 || Math.abs((zone.h ?? 0) - level) > EPS) return [];
    return [points as readonly Vec2[]];
  });
}

function obstacles(scene: Scene, spec: ReachableCheck, named: ReadonlySet<string>, level: number): readonly Rect[] {
  const skipped = new Set([...(spec.ignore ?? []), ...named]);
  return scene.objects.filter((object) => !skipped.has(object.id) && takesSpace(sizeBox(scene, object), level, spec.height)).map((object) => footprint(scene, object));
}

function lengthOf(lane: Lane): number {
  let total = 0;
  for (let i = 1; i < lane.points.length; i++) {
    const a = lane.points[i - 1] as readonly number[];
    const b = lane.points[i] as readonly number[];
    total += Math.hypot((b[0] as number) - (a[0] as number), (b[1] as number) - (a[1] as number), pointHeight(lane, b) - pointHeight(lane, a));
  }
  return total;
}

/**
 * `reachable` with `toLevel` (SPEC 9.8): one grid per level, joined by connector lanes.
 * The value is the shortest length, grid moves costing `step` and a connector its length in (u, v, h).
 */
export function checkReachableLevels(scene: Scene, spec: ReachableCheck): CheckResult {
  const from = resolvePoint(scene, spec.from, "first");
  const to = resolvePoint(scene, spec.to, "last");
  if (from === null || to === null) return skipResult(spec, "a point of the check does not resolve");
  const named = new Set([from, to].map((point) => point.object).filter((id): id is string => id !== null));
  const ids = inObjectOrder(scene, named);
  const step = spec.step ?? DEFAULT_STEP;
  const heights = heightsOf(scene, spec);
  const levels: Level[] = [];
  let cells = 0;
  for (const height of heights) {
    const walkable = polygons(scene, "walkable", height);
    if (walkable.length === 0) {
      levels.push({ grid: null });
      continue;
    }
    const grid = buildGrid({
      step,
      radius: spec.radius ?? DEFAULT_RADIUS,
      walkable,
      blocked: polygons(scene, "blocked", height),
      obstacles: obstacles(scene, spec, named, height),
    });
    if (grid === null) return skipResult(spec, `the grid has more than ${MAX_CELLS} cells; use a larger step`);
    cells += grid.cols * grid.rows;
    if (cells > MAX_CELLS) return skipResult(spec, `the grid has more than ${MAX_CELLS} cells; use a larger step`);
    levels.push({ grid });
  }
  const failure = (message: string): CheckResult => ({
    id: spec.id, check: spec.check, status: "fail", value: null, threshold: spec.max ?? null, ids, message,
  });
  const startGrid = levels[0]?.grid ?? null;
  if (startGrid === null) return failure("start is not on walkable ground");
  const start = nearestFree(startGrid, from.at);
  if (start === null || start.distance > step + EPS) return failure("start is not on walkable ground");
  const goalLevel = levelIndex(heights, spec.toLevel as number);
  const goalGrid = levels[goalLevel]?.grid ?? null;
  if (goalGrid === null) return failure("target is not on walkable ground");
  const goal = nearestFree(goalGrid, to.at);
  if (goal === null || goal.distance > step + EPS) return failure("target is not on walkable ground");
  const edges: LevelEdges = new Map();
  addGridEdges(edges, levels.map((level) => level.grid), step);
  const ignored = new Set([...(spec.ignore ?? []), ...named]);
  for (const lane of scene.lanes ?? []) {
    const shape = lanePieces(lane);
    if (!shape.ok) continue;
    const points = lane.points;
    const first = points[0] as readonly number[];
    const last = points[points.length - 1] as readonly number[];
    const a = levelIndex(heights, pointHeight(lane, first));
    const b = levelIndex(heights, pointHeight(lane, last));
    if (a < 0 || b < 0 || a === b) continue;
    const gridA = levels[a]?.grid ?? null;
    const gridB = levels[b]?.grid ?? null;
    if (gridA === null || gridB === null) continue;
    if (scene.objects.some((object) => !ignored.has(object.id) && objectBlocksLane(scene, object, shape.pieces, spec.height))) continue;
    const endA = nearestFree(gridA, [first[0] as number, first[1] as number]);
    const endB = nearestFree(gridB, [last[0] as number, last[1] as number]);
    if (endA === null || endB === null || endA.distance > step + EPS || endB.distance > step + EPS) continue;
    const length = lengthOf(lane);
    edgeList(edges, `${a}:${endA.cell}`).push([`${b}:${endB.cell}`, length]);
    edgeList(edges, `${b}:${endB.cell}`).push([`${a}:${endA.cell}`, length]);
  }
  const cost = shortestCost(edges, `0:${start.cell}`, `${goalLevel}:${goal.cell}`);
  if (cost === null) return failure("no walkable path");
  const value = round6(cost);
  const passing = spec.max === undefined || value <= spec.max + EPS;
  const status = marginStatus(passing, value, spec.max ?? value, spec.warn, "upper");
  return {
    id: spec.id,
    check: spec.check,
    status,
    value,
    threshold: spec.max ?? null,
    ids,
    message: `path of ${value.toFixed(2)} ${scene.units.name}${spec.max === undefined ? "" : ` (max ${spec.max.toFixed(2)})`}`,
  };
}
