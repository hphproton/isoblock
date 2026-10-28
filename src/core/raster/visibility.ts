import { round6 } from "../checks/result";
import { IsoblockError } from "../errors";
import { sceneInState } from "../states";
import type { Scene, SceneObject } from "../types";
import { objectCounts, regionCover, unionFull, type Rect } from "./counts";
import { objectRaster, type ObjectRaster } from "./raster";

export interface VisibilityObject {
  readonly id: string;
  readonly type: string;
  readonly tags: readonly string[];
  readonly full: number;
  readonly visible: number;
  readonly share: number;
  readonly cover: number;
}

export interface VisibilityTag {
  readonly tag: string;
  readonly ids: readonly string[];
  readonly full: number;
  readonly visible: number;
  readonly share: number;
  readonly cover: number;
}

export interface VisibilityReport {
  readonly scene: string;
  readonly state: string | null;
  readonly region: { readonly id: string | null; readonly pixels: number; readonly covered: number; readonly share: number };
  readonly objects: readonly VisibilityObject[];
  readonly tags: readonly VisibilityTag[];
}

interface Listed {
  readonly object: SceneObject;
  readonly slot: number;
  readonly full: number;
  readonly visible: number;
}

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : round6(part / whole);
}

/**
 * How much of each drawn object shows in a frame region, and how much of the region the objects
 * cover (SPEC 11.3). `region` null is the whole raster. An unknown region, and a region the state
 * hides, are usage errors.
 */
export function visibilityReport(scene: Scene, state: string | null, region: string | null, raster?: ObjectRaster): VisibilityReport {
  const viewed = state === null ? scene : sceneInState(scene, state);
  const rect = resolveRegion(viewed, state, region);
  const image = raster ?? objectRaster(viewed);
  const cover = regionCover(image, rect);
  const listed: Listed[] = [];
  viewed.objects.forEach((object, slot) => {
    const counts = objectCounts(image, slot, rect);
    if (counts.full === 0) return;
    listed.push({ object, slot, full: counts.full, visible: counts.visible });
  });
  const objects: VisibilityObject[] = listed.map((row) => ({
    id: row.object.id,
    type: row.object.type,
    tags: [...(row.object.tags ?? [])],
    full: row.full,
    visible: row.visible,
    share: ratio(row.visible, row.full),
    cover: ratio(row.visible, cover.pixels),
  }));
  return {
    scene: scene.id,
    state,
    region: { id: region, pixels: cover.pixels, covered: cover.covered, share: ratio(cover.covered, cover.pixels) },
    objects,
    tags: tagRows(listed, image, rect, cover.pixels),
  };
}

function resolveRegion(scene: Scene, state: string | null, region: string | null): Rect | null {
  if (region === null) return null;
  const found = scene.frame.regions.find((item) => item.id === region);
  if (found === undefined) throw new IsoblockError("E_USAGE", `unknown region '${region}'`);
  if ((scene.hiddenRegions ?? []).includes(region)) {
    throw new IsoblockError("E_USAGE", `region '${region}' is hidden in state '${state ?? ""}'`);
  }
  return found.rect;
}

function tagRows(listed: readonly Listed[], raster: ObjectRaster, rect: Rect | null, pixels: number): VisibilityTag[] {
  const rows: { tag: string; slots: number[]; ids: string[]; visible: number }[] = [];
  const byTag = new Map<string, { tag: string; slots: number[]; ids: string[]; visible: number }>();
  for (const row of listed) {
    for (const tag of row.object.tags ?? []) {
      let found = byTag.get(tag);
      if (found === undefined) {
        found = { tag, slots: [], ids: [], visible: 0 };
        byTag.set(tag, found);
        rows.push(found);
      }
      found.slots.push(row.slot);
      found.ids.push(row.object.id);
      found.visible += row.visible;
    }
  }
  return rows.map((row) => {
    const full = unionFull(raster, row.slots, rect);
    return { tag: row.tag, ids: row.ids, full, visible: row.visible, share: ratio(row.visible, full), cover: ratio(row.visible, pixels) };
  });
}

/** Text form of a visibility report. The layout is for people; tools read the JSON. */
export function formatVisibility(report: VisibilityReport): string {
  const where = report.region.id === null ? "whole frame" : `region ${report.region.id}`;
  const state = report.state === null ? "default" : report.state;
  const head = `visibility ${report.scene} state ${state} ${where}: covered ${report.region.covered}/${report.region.pixels} (${report.region.share})`;
  const objects = report.objects.map((row) =>
    `${row.id} ${row.type}: full ${row.full} visible ${row.visible} share ${row.share} cover ${row.cover}`,
  );
  const tags = report.tags.map((row) =>
    `tag ${row.tag} [${row.ids.join(", ")}]: full ${row.full} visible ${row.visible} share ${row.share} cover ${row.cover}`,
  );
  return [head, ...objects, ...tags].join("\n");
}
