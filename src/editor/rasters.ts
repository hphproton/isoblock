import { IsoblockError } from "../core/errors";
import { occludersStudy, type OccludersReport } from "../core/occluders";
import { objectRaster, type ObjectRaster } from "../core/raster/raster";
import { visibilityReport, type VisibilityReport } from "../core/raster/visibility";
import { sceneInState } from "../core/states";
import type { Scene } from "../core/types";
import { activeStateName } from "./shown";
import type { EditorState, StaleOverlay } from "./store";

const NO_STALE: ReadonlySet<StaleOverlay> = new Set();
const NO_POINTS: readonly (readonly [number, number])[] = [];
const ACTOR = /^(-?(?:\d+(?:\.\d*)?|\.\d+)),(-?(?:\d+(?:\.\d*)?|\.\d+)),(-?(?:\d+(?:\.\d*)?|\.\d+))$/;

type Hold = Pick<EditorState, "masksReport" | "maskRaster" | "occludersReport" | "occluderPoints" | "staleOverlays">;

function sceneOf(state: EditorState): Scene | null {
  return state.live ?? state.history?.present ?? null;
}

function sameView(prev: EditorState, next: EditorState): boolean {
  return sceneOf(prev) === sceneOf(next) && prev.shownState === next.shownState && (prev.live === null) === (next.live === null);
}

/** True when the mask or occluder picture may differ. */
export function rastersDiffer(prev: EditorState, next: EditorState): boolean {
  return !sameView(prev, next) || prev.overlays !== next.overlays || prev.occluder !== next.occluder;
}

function stateArg(scene: Scene, shown: string): string | null {
  return activeStateName(scene, shown) ?? null;
}

function actorOf(text: string): readonly [number, number, number] | null {
  const match = ACTOR.exec(text.trim());
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function areaOf(value: string): { lane?: string; zone?: string } | null {
  if (value.startsWith("lane:")) return { lane: value.slice(5) };
  if (value.startsWith("zone:")) return { zone: value.slice(5) };
  return null;
}

function masksOf(prev: EditorState, next: EditorState, scene: Scene | null): { report: VisibilityReport | null; raster: ObjectRaster | null } {
  if (scene === null || !next.overlays.masks) return { report: null, raster: null };
  if (next.overlays.masks && prev.overlays.masks && sameView(prev, next) && prev.maskRaster !== null) {
    return { report: prev.masksReport, raster: prev.maskRaster };
  }
  const state = stateArg(scene, next.shownState);
  const viewed = state === null ? scene : sceneInState(scene, state);
  const raster = objectRaster(viewed);
  return { report: visibilityReport(scene, state, null, raster), raster };
}

function occludersOf(
  prev: EditorState,
  next: EditorState,
  scene: Scene | null,
): { report: OccludersReport | null; points: readonly (readonly [number, number])[]; fault: string | null | undefined } {
  if (scene === null || next.occluder.area === "") return { report: null, points: NO_POINTS, fault: null };
  if (prev.occluder === next.occluder && sameView(prev, next)) {
    return { report: prev.occludersReport, points: prev.occluderPoints, fault: undefined };
  }
  const actor = actorOf(next.occluder.actor);
  const area = areaOf(next.occluder.area);
  if (actor === null || area === null || !Number.isFinite(next.occluder.step)) {
    return { report: null, points: NO_POINTS, fault: null };
  }
  try {
    const study = occludersStudy(scene, stateArg(scene, next.shownState), actor, next.occluder.step, area.lane, area.zone);
    return { report: study.report, points: study.points.length === 0 ? NO_POINTS : study.points, fault: null };
  } catch (error) {
    if (!(error instanceof IsoblockError)) throw error;
    return { report: null, points: NO_POINTS, fault: error.message };
  }
}

function staleSet(prev: ReadonlySet<StaleOverlay>, names: readonly StaleOverlay[]): ReadonlySet<StaleOverlay> {
  if (names.length === 0) return NO_STALE;
  if (prev.size === names.length && names.every((name) => prev.has(name))) return prev;
  return new Set(names);
}

/** Mask and occluder pictures for `next`. During a drag the previous pictures stay and are marked stale. */
export function nextRasters(prev: EditorState, next: EditorState): { hold: Hold; fault: string | null | undefined } {
  const scene = sceneOf(next);
  if (next.live !== null) {
    const names: StaleOverlay[] = [];
    if (next.overlays.masks) names.push("masks");
    if (next.occluder.area !== "") names.push("occluders");
    return {
      hold: {
        masksReport: prev.masksReport,
        maskRaster: prev.maskRaster,
        occludersReport: prev.occludersReport,
        occluderPoints: prev.occluderPoints,
        staleOverlays: staleSet(prev.staleOverlays, names),
      },
      fault: undefined,
    };
  }
  const masks = masksOf(prev, next, scene);
  const occluders = occludersOf(prev, next, scene);
  return {
    hold: {
      masksReport: masks.report,
      maskRaster: masks.raster,
      occludersReport: occluders.report,
      occluderPoints: occluders.points,
      staleOverlays: NO_STALE,
    },
    fault: occluders.fault,
  };
}
