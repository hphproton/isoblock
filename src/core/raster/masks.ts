import { IsoblockError } from "../errors";
import { round6 } from "../checks/result";
import { sceneInState } from "../states";
import type { Scene, SceneObject } from "../types";
import { countLabeled, countSet } from "./counts";
import { cropWindow, growWindow, windowBox } from "./grow";
import { objectRaster, type MaskWindow } from "./raster";

const MAX_OBJECTS = 65535;

export interface MaskImage {
  /** Path inside the export folder, with `/` separators. */
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** 8-bit samples, 255 in the mask and 0 elsewhere, row-major. */
  readonly pixels: Uint8Array;
}

interface MaskPart {
  readonly file: string;
  readonly box: readonly [number, number, number, number];
  readonly pixels: number;
}

interface VisiblePart {
  readonly file: string;
  readonly pixels: number;
}

interface MaskObject {
  readonly id: string;
  readonly index: number;
  readonly type: string;
  readonly tags: readonly string[];
  readonly full: MaskPart | null;
  readonly visible: VisiblePart | null;
  readonly share: number | null;
}

interface MaskGroup {
  readonly tag: string;
  readonly ids: readonly string[];
  readonly full: MaskPart | null;
  readonly visible: VisiblePart | null;
  readonly share: number | null;
}

export interface MaskDocument {
  readonly schema: "isoblock-masks/1";
  readonly scene: string;
  readonly state: string | null;
  readonly frame: { readonly w: number; readonly h: number };
  readonly grow: number;
  readonly labels: "labels.png";
  readonly objects: readonly MaskObject[];
  readonly groups: readonly MaskGroup[];
}

export interface MaskBundle {
  readonly json: MaskDocument;
  readonly width: number;
  readonly height: number;
  /** 16-bit label of every pixel, row-major. 0 is no object. */
  readonly labels: Uint16Array;
  readonly images: readonly MaskImage[];
}

interface TagGroup {
  readonly tag: string;
  readonly ids: string[];
}

function tagGroups(objects: readonly SceneObject[]): TagGroup[] {
  const groups: TagGroup[] = [];
  const byTag = new Map<string, string[]>();
  for (const object of objects) {
    for (const tag of object.tags ?? []) {
      let ids = byTag.get(tag);
      if (ids === undefined) {
        ids = [];
        byTag.set(tag, ids);
        groups.push({ tag, ids });
      }
      ids.push(object.id);
    }
  }
  return groups;
}

function unionWindows(windows: readonly MaskWindow[]): MaskWindow {
  const present = windows.filter((mask) => mask.width > 0 && mask.height > 0);
  if (present.length === 0) return { x0: 0, y0: 0, width: 0, height: 0, samples: new Uint8Array() };
  const x0 = Math.min(...present.map((mask) => mask.x0));
  const y0 = Math.min(...present.map((mask) => mask.y0));
  const x1 = Math.max(...present.map((mask) => mask.x0 + mask.width));
  const y1 = Math.max(...present.map((mask) => mask.y0 + mask.height));
  const width = x1 - x0;
  const height = y1 - y0;
  const samples = new Uint8Array(width * height);
  for (const mask of present) {
    for (let y = 0; y < mask.height; y++) {
      const from = y * mask.width;
      const to = (mask.y0 - y0 + y) * width + (mask.x0 - x0);
      for (let x = 0; x < mask.width; x++) if (mask.samples[from + x] !== 0) samples[to + x] = 1;
    }
  }
  return { x0, y0, width, height, samples };
}

/** Visible pixels of `wanted` labels inside `bounds`. Visible pixels lie inside the full mask. */
function visibleOf(labels: Uint32Array, rasterWidth: number, wanted: ReadonlySet<number>, bounds: MaskWindow): MaskWindow {
  const samples = new Uint8Array(bounds.width * bounds.height);
  for (let y = 0; y < bounds.height; y++) {
    const row = (bounds.y0 + y) * rasterWidth + bounds.x0;
    const local = y * bounds.width;
    for (let x = 0; x < bounds.width; x++) if (wanted.has(labels[row + x] as number)) samples[local + x] = 1;
  }
  return { x0: bounds.x0, y0: bounds.y0, width: bounds.width, height: bounds.height, samples };
}

function imageOf(name: string, samples: Uint8Array, box: readonly [number, number, number, number]): MaskImage {
  return { name, width: box[2] - box[0], height: box[3] - box[1], pixels: samples };
}

/**
 * The mask folder of SPEC 14.1 for `scene` in `state` (`null` is every object). `grow` is the
 * Chebyshev band, 0 to 64. More than 65,535 objects cannot be written as a 16-bit label image.
 */
export function maskBundle(scene: Scene, state: string | null, grow: number): MaskBundle {
  if (scene.objects.length > MAX_OBJECTS) {
    throw new IsoblockError("E_USAGE", `a scene of ${scene.objects.length} objects cannot be written as a 16-bit label image`);
  }
  const viewed = state === null ? scene : sceneInState(scene, state);
  const fileIndex = new Map(scene.objects.map((object, i) => [object.id, i + 1]));
  const raster = objectRaster(viewed, fileIndex);
  const slotOf = new Map(viewed.objects.map((object, slot) => [object.id, slot]));
  const images: MaskImage[] = [];

  const objects: MaskObject[] = scene.objects.map((object) => {
    const index = fileIndex.get(object.id) as number;
    const slot = slotOf.get(object.id);
    const base = { id: object.id, index, type: object.type, tags: [...(object.tags ?? [])] };
    if (slot === undefined) return { ...base, full: null, visible: null, share: null };
    const fullMask = raster.full[slot] as MaskWindow;
    const fullPixels = countSet(fullMask.samples);
    if (fullPixels === 0) return { ...base, full: null, visible: null, share: null };
    const visiblePixels = countLabeled(raster, slot);
    const grownFull = growWindow(fullMask, raster.width, raster.height, grow);
    const box = windowBox(grownFull) as readonly [number, number, number, number];
    const fullName = `full/${index}.png`;
    const visibleName = `visible/${index}.png`;
    images.push(imageOf(fullName, cropWindow(grownFull, box), box));
    const grownVisible = growWindow(visibleOf(raster.labels, raster.width, new Set([index]), fullMask), raster.width, raster.height, grow);
    images.push(imageOf(visibleName, cropWindow(grownVisible, box), box));
    return {
      ...base,
      full: { file: fullName, box, pixels: fullPixels },
      visible: { file: visibleName, pixels: visiblePixels },
      share: round6(visiblePixels / fullPixels),
    };
  });

  let groupNumber = 0;
  const groups: MaskGroup[] = tagGroups(scene.objects).map((group) => {
    const members: MaskWindow[] = [];
    const wanted = new Set<number>();
    for (const id of group.ids) {
      const slot = slotOf.get(id);
      if (slot === undefined) continue;
      wanted.add(raster.index[slot] as number);
      members.push(raster.full[slot] as MaskWindow);
    }
    const union = unionWindows(members);
    const fullPixels = countSet(union.samples);
    if (fullPixels === 0) return { tag: group.tag, ids: group.ids, full: null, visible: null, share: null };
    groupNumber += 1;
    const visibleMask = visibleOf(raster.labels, raster.width, wanted, union);
    const visiblePixels = countSet(visibleMask.samples);
    const grownFull = growWindow(union, raster.width, raster.height, grow);
    const box = windowBox(grownFull) as readonly [number, number, number, number];
    const fullName = `groups/full/${groupNumber}.png`;
    const visibleName = `groups/visible/${groupNumber}.png`;
    images.push(imageOf(fullName, cropWindow(grownFull, box), box));
    const grownVisible = growWindow(visibleMask, raster.width, raster.height, grow);
    images.push(imageOf(visibleName, cropWindow(grownVisible, box), box));
    return {
      tag: group.tag,
      ids: group.ids,
      full: { file: fullName, box, pixels: fullPixels },
      visible: { file: visibleName, pixels: visiblePixels },
      share: round6(visiblePixels / fullPixels),
    };
  });

  const labels = Uint16Array.from(raster.labels);
  return {
    width: raster.width,
    height: raster.height,
    labels,
    images,
    json: {
      schema: "isoblock-masks/1",
      scene: scene.id,
      state,
      frame: { w: raster.width, h: raster.height },
      grow,
      labels: "labels.png",
      objects,
      groups,
    },
  };
}
