import { IsoblockError } from "../errors";
import { round6 } from "../checks/result";
import { sceneInState } from "../states";
import type { Scene, SceneObject } from "../types";
import { countLabel, countSet } from "./counts";
import { cropMask, growMask, maskBox } from "./grow";
import { objectRaster } from "./raster";

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
    const fullMask = raster.full[slot] as Uint8Array;
    const fullPixels = countSet(fullMask);
    if (fullPixels === 0) return { ...base, full: null, visible: null, share: null };
    const visiblePixels = countLabel(raster.labels, index);
    const grownFull = growMask(fullMask, raster.width, raster.height, grow);
    const box = maskBox(grownFull, raster.width, raster.height) as readonly [number, number, number, number];
    const fullName = `full/${index}.png`;
    const visibleName = `visible/${index}.png`;
    images.push(imageOf(fullName, cropMask(grownFull, raster.width, box), box));
    const visibleMask = new Uint8Array(raster.labels.length);
    for (let i = 0; i < visibleMask.length; i++) if (raster.labels[i] === index) visibleMask[i] = 1;
    const grownVisible = growMask(visibleMask, raster.width, raster.height, grow);
    images.push(imageOf(visibleName, cropMask(grownVisible, raster.width, box), box));
    return {
      ...base,
      full: { file: fullName, box, pixels: fullPixels },
      visible: { file: visibleName, pixels: visiblePixels },
      share: round6(visiblePixels / fullPixels),
    };
  });

  let groupNumber = 0;
  const groups: MaskGroup[] = tagGroups(scene.objects).map((group) => {
    const union = new Uint8Array(raster.labels.length);
    const visibleMask = new Uint8Array(raster.labels.length);
    const wanted = new Set<number>();
    for (const id of group.ids) {
      const slot = slotOf.get(id);
      if (slot === undefined) continue;
      wanted.add(raster.index[slot] as number);
      const mask = raster.full[slot] as Uint8Array;
      for (let i = 0; i < union.length; i++) if (mask[i] !== 0) union[i] = 1;
    }
    for (let i = 0; i < visibleMask.length; i++) if (wanted.has(raster.labels[i] as number)) visibleMask[i] = 1;
    const fullPixels = countSet(union);
    if (fullPixels === 0) return { tag: group.tag, ids: group.ids, full: null, visible: null, share: null };
    groupNumber += 1;
    const visiblePixels = countSet(visibleMask);
    const grownFull = growMask(union, raster.width, raster.height, grow);
    const box = maskBox(grownFull, raster.width, raster.height) as readonly [number, number, number, number];
    const fullName = `groups/full/${groupNumber}.png`;
    const visibleName = `groups/visible/${groupNumber}.png`;
    images.push(imageOf(fullName, cropMask(grownFull, raster.width, box), box));
    const grownVisible = growMask(visibleMask, raster.width, raster.height, grow);
    images.push(imageOf(visibleName, cropMask(grownVisible, raster.width, box), box));
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
