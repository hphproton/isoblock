import { boxInfo, orderInfos } from "../drawOrder";
import { worldParts, type Box } from "../geometry";
import { orderDirection, projector } from "../projection";
import type { Scene } from "../types";
import { paintOutline, partOutline } from "./fill";

/** The object raster of a scene in one state (SPEC 14.1). */
export interface ObjectRaster {
  readonly width: number;
  readonly height: number;
  /** 1-based object index of the pixel, 0 where no object is drawn. Row-major. */
  readonly labels: Uint32Array;
  /** Full mask of each object of `scene`, in file order: 1 where a drawn part covers the pixel. */
  readonly full: readonly Uint8Array[];
  /** The index written into `labels` for each object. */
  readonly index: readonly number[];
}

/**
 * Raster of the drawn parts in the painter's order (SPEC 14.1). `fileIndex` gives the 1-based
 * position of an object in the scene file, so a state that hides objects keeps the same numbers.
 * Without it, the index is the object's place in `scene.objects`.
 */
export function objectRaster(scene: Scene, fileIndex?: ReadonlyMap<string, number>): ObjectRaster {
  const width = Math.ceil(scene.frame.w);
  const height = Math.ceil(scene.frame.h);
  const labels = new Uint32Array(width * height);
  const full = scene.objects.map(() => new Uint8Array(width * height));
  const index = scene.objects.map((object, slot) => fileIndex?.get(object.id) ?? slot + 1);
  const at = projector(scene.camera);
  const c = orderDirection(scene.camera);
  const drawn: { readonly slot: number; readonly box: Box }[] = [];
  scene.objects.forEach((object, slot) => {
    for (const part of worldParts(scene, object)) drawn.push({ slot, box: part.box });
  });
  const infos = drawn.map((part) => boxInfo(part.box, scene.camera, c));
  for (const place of orderInfos(infos, c)) {
    const part = drawn[place] as { readonly slot: number; readonly box: Box };
    const outline = partOutline(part.box, at);
    if (outline === null) continue;
    const label = index[part.slot] as number;
    const mask = full[part.slot] as Uint8Array;
    paintOutline(outline, width, height, (pixel) => {
      labels[pixel] = label;
      mask[pixel] = 1;
    });
  }
  return { width, height, labels, full, index };
}
