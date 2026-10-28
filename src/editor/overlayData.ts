import { round6 } from "../core/checks/result";
import { visibleSamples } from "../core/checks/visibleSamples";
import { runtimeSprite } from "../core/export/runtime";
import { baseHeight, sizeBox, worldParts } from "../core/geometry";
import { cameraDirection } from "../core/projection";
import { leavePoint } from "../core/rays";
import { evaluateRelations } from "../core/relations/evaluate";
import { round } from "../core/round";
import { sceneSprites } from "../core/sort/sprites";
import type { CheckResult, Scene, Vec3, VisibleCheck } from "../core/types";
import { sceneShown } from "./shown";
import { currentScene, type EditorState } from "./store";

export interface RaySample {
  readonly at: readonly [number, number, number];
  readonly occluded: boolean;
  readonly by: readonly string[];
  readonly leave: Vec3 | null;
}

export interface SortPointRow {
  readonly object: string;
  readonly slice: number;
  readonly key: number;
  readonly point: readonly [number, number, number];
}

/** Sort points of the objects drawn in the shown state, in sprite-list order (SPEC 10). */
export function sortPointRows(scene: Scene, shown: string): readonly SortPointRow[] {
  const view = sceneShown(scene, shown);
  const groups = sceneSprites(view);
  const rows: SortPointRow[] = [];
  view.objects.forEach((object, index) => {
    const base = baseHeight(object);
    (groups[index] ?? []).forEach((sprite, slice) => {
      const foot = runtimeSprite(sprite).footprint;
      rows.push({
        object: object.id,
        slice,
        key: runtimeSprite(sprite).key,
        point: [round((foot[0] + foot[2]) / 2, 6), round((foot[1] + foot[3]) / 2, 6), round(base, 6)],
      });
    });
  });
  return rows;
}

/** Samples of the highlighted `visible` check, or none when that check is missing or skipped. */
export function raySamples(scene: Scene, shown: string, checkId: string | null, results: readonly CheckResult[]): { check: string | null; samples: readonly RaySample[] } {
  const empty = { check: null, samples: [] as readonly RaySample[] };
  if (checkId === null) return empty;
  const result = results.find((row) => row.id === checkId);
  const spec = (scene.checks ?? []).find((row) => row.id === checkId);
  if (result === undefined || spec === undefined || spec.check !== "visible" || result.status === "skip") return empty;
  const visible = spec as VisibleCheck;
  const view = sceneShown(scene, shown);
  const target = view.objects.find((object) => object.id === visible.target);
  if (target === undefined) return empty;
  const direction = cameraDirection(view.camera);
  const others = view.objects
    .filter((object) => object.id !== target.id)
    .map((object) => ({ id: object.id, parts: worldParts(view, object) }));
  const samples = visibleSamples(sizeBox(view, target), direction, visible.from ?? 0.55).map((sample) => {
    const by: string[] = [];
    let leave: Vec3 | null = null;
    let leaveT = -Infinity;
    for (const other of others) {
      let hit = false;
      for (const part of other.parts) {
        const end = leavePoint(sample.origin, direction, part.box);
        if (end === null) continue;
        hit = true;
        const distance = Math.hypot(end[0] - sample.origin[0], end[1] - sample.origin[1], end[2] - sample.origin[2]);
        if (distance > leaveT) {
          leaveT = distance;
          leave = end;
        }
      }
      if (hit) by.push(other.id);
    }
    return {
      at: [round6(sample.at[0]), round6(sample.at[1]), round6(sample.at[2])] as const,
      occluded: by.length > 0,
      by,
      leave,
    };
  });
  return { check: visible.id, samples };
}

/** The data `window.isoblock.overlay(name)` returns (SPEC 10). */
export function overlayValue(state: EditorState, name: string): unknown {
  const scene = currentScene(state);
  if (scene === null) return null;
  if (name === "proposal") return state.proposal?.report ?? null;
  if (name === "relations") {
    if (!state.overlays.relations) return null;
    return { results: evaluateRelations(scene).results };
  }
  if (name === "sortPoints") {
    if (!state.overlays.sortPoints) return null;
    return { sprites: sortPointRows(scene, state.shownState) };
  }
  if (name === "rays") {
    if (!state.overlays.rays) return null;
    const rays = raySamples(scene, state.shownState, state.highlightCheck, state.results);
    return { check: rays.check, samples: rays.samples.map(({ at, occluded, by }) => ({ at, occluded, by })) };
  }
  if (name === "masks") return state.overlays.masks ? state.masksReport : null;
  if (name === "occluders") return state.occluder.area === "" ? null : state.occludersReport;
  return null;
}
