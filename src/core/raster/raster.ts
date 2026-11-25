import { boxInfo, orderInfos } from "../drawOrder";
import { worldParts, type Box } from "../geometry";
import { orderDirection, projector } from "../projection";
import type { Scene } from "../types";
import { outlinePixelBounds, paintOutline, partOutline } from "./fill";

/** Pixels of one object's full mask: the bounding box of its outlines, not the whole frame (SPEC 14.1). */
export interface MaskWindow {
  readonly x0: number;
  readonly y0: number;
  readonly width: number;
  readonly height: number;
  readonly samples: Uint8Array;
}

/** The object raster of a scene in one state (SPEC 14.1). */
export interface ObjectRaster {
  readonly width: number;
  readonly height: number;
  /** 1-based object index of the pixel, 0 where no object is drawn. Row-major. */
  readonly labels: Uint32Array;
  /** Full mask of each object of `scene`, in file order. */
  readonly full: readonly MaskWindow[];
  /** The index written into `labels` for each object. */
  readonly index: readonly number[];
}

const EMPTY: MaskWindow = { x0: 0, y0: 0, width: 0, height: 0, samples: new Uint8Array() };

/** 1 where the mask covers raster pixel `index`, else 0. */
export function maskAt(mask: MaskWindow, rasterWidth: number, index: number): number {
  if (mask.width === 0) return 0;
  const x = index % rasterWidth;
  const y = (index - x) / rasterWidth;
  const lx = x - mask.x0;
  const ly = y - mask.y0;
  if (lx < 0 || ly < 0 || lx >= mask.width || ly >= mask.height) return 0;
  return mask.samples[ly * mask.width + lx] ?? 0;
}

interface Drawn {
  readonly slot: number;
  readonly box: Box;
  readonly outline: ReturnType<typeof partOutline>;
  readonly bounds: { readonly i0: number; readonly j0: number; readonly i1: number; readonly j1: number } | null;
}

/**
 * Raster of the drawn parts in the painter's order (SPEC 14.1). `fileIndex` gives the 1-based
 * position of an object in the scene file, so a state that hides objects keeps the same numbers.
 * Without it, the index is the object's place in `scene.objects`. Each full mask keeps only the
 * pixels of the bounding box of that object's outlines.
 */
export function objectRaster(scene: Scene, fileIndex?: ReadonlyMap<string, number>): ObjectRaster {
  const width = Math.ceil(scene.frame.w);
  const height = Math.ceil(scene.frame.h);
  const labels = new Uint32Array(width * height);
  const index = scene.objects.map((object, slot) => fileIndex?.get(object.id) ?? slot + 1);
  const at = projector(scene.camera);
  const c = orderDirection(scene.camera);
  const drawn: Drawn[] = [];
  scene.objects.forEach((object, slot) => {
    for (const part of worldParts(scene, object)) {
      const outline = partOutline(part.box, at);
      drawn.push({ slot, box: part.box, outline, bounds: outline === null ? null : outlinePixelBounds(outline, width, height) });
    }
  });
  const full = scene.objects.map((_, slot) => windowOf(drawn, slot));
  const infos = drawn.map((part) => boxInfo(part.box, scene.camera, c));
  for (const place of orderInfos(infos, c)) {
    const part = drawn[place] as Drawn;
    if (part.outline === null) continue;
    const label = index[part.slot] as number;
    const mask = full[part.slot] as MaskWindow;
    paintOutline(part.outline, width, height, (pixel) => {
      labels[pixel] = label;
      if (mask.width === 0) return;
      const x = pixel % width;
      const y = (pixel - x) / width;
      mask.samples[(y - mask.y0) * mask.width + (x - mask.x0)] = 1;
    });
  }
  return { width, height, labels, full, index };
}

function windowOf(drawn: readonly Drawn[], slot: number): MaskWindow {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const part of drawn) {
    if (part.slot !== slot || part.bounds === null) continue;
    if (part.bounds.i0 < x0) x0 = part.bounds.i0;
    if (part.bounds.j0 < y0) y0 = part.bounds.j0;
    if (part.bounds.i1 > x1) x1 = part.bounds.i1;
    if (part.bounds.j1 > y1) y1 = part.bounds.j1;
  }
  if (x1 < x0 || y1 < y0) return EMPTY;
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  return { x0, y0, width, height, samples: new Uint8Array(width * height) };
}
