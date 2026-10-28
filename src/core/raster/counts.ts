import type { ObjectRaster } from "./raster";
import { pixelRange, rangeCount, type PixelRange } from "./region";

export type Rect = readonly [number, number, number, number];

/** Full and visible pixels of one object inside a region (the whole raster when `rect` is null). */
export function objectCounts(raster: ObjectRaster, slot: number, rect: Rect | null): { readonly full: number; readonly visible: number } {
  const range = pixelRange(raster.width, raster.height, rect);
  const mask = raster.full[slot] as Uint8Array;
  const label = raster.index[slot] as number;
  let full = 0;
  let visible = 0;
  eachPixel(raster.width, range, (pixel) => {
    if (mask[pixel] !== 0) full += 1;
    if (raster.labels[pixel] === label) visible += 1;
  });
  return { full, visible };
}

/** Region pixels, and how many of them the raster gives to an object. */
export function regionCover(raster: ObjectRaster, rect: Rect | null): { readonly pixels: number; readonly covered: number } {
  const range = pixelRange(raster.width, raster.height, rect);
  let covered = 0;
  eachPixel(raster.width, range, (pixel) => {
    if (raster.labels[pixel] !== 0) covered += 1;
  });
  return { pixels: rangeCount(range), covered };
}

/** Pixels of the region in the union of the full masks of `slots`. */
export function unionFull(raster: ObjectRaster, slots: readonly number[], rect: Rect | null): number {
  const range = pixelRange(raster.width, raster.height, rect);
  const masks = slots.map((slot) => raster.full[slot] as Uint8Array);
  let count = 0;
  eachPixel(raster.width, range, (pixel) => {
    if (masks.some((mask) => mask[pixel] !== 0)) count += 1;
  });
  return count;
}

function eachPixel(width: number, range: PixelRange, visit: (pixel: number) => void): void {
  for (let j = range.j0; j < range.j1; j++) {
    const row = j * width;
    for (let i = range.i0; i < range.i1; i++) visit(row + i);
  }
}

/** Pixels set in a mask, over the whole raster. */
export function countSet(mask: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] !== 0) count += 1;
  return count;
}

/** Pixels whose label is `index`. */
export function countLabel(labels: Uint32Array, index: number): number {
  let count = 0;
  for (let i = 0; i < labels.length; i++) if (labels[i] === index) count += 1;
  return count;
}
