import type { MaskWindow, ObjectRaster } from "./raster";
import { pixelRange, rangeCount, type PixelRange } from "./region";

export type Rect = readonly [number, number, number, number];

/** Full and visible pixels of one object inside a region (the whole raster when `rect` is null). */
export function objectCounts(raster: ObjectRaster, slot: number, rect: Rect | null): { readonly full: number; readonly visible: number } {
  const mask = raster.full[slot] as MaskWindow;
  const label = raster.index[slot] as number;
  const range = clip(pixelRange(raster.width, raster.height, rect), mask);
  let full = 0;
  let visible = 0;
  for (let j = range.j0; j < range.j1; j++) {
    const row = j * raster.width;
    const local = (j - mask.y0) * mask.width + (range.i0 - mask.x0);
    for (let i = range.i0; i < range.i1; i++) {
      if (mask.samples[local + (i - range.i0)] !== 0) full += 1;
      if (raster.labels[row + i] === label) visible += 1;
    }
  }
  return { full, visible };
}

/** Visible pixels of one object over the whole raster. They lie inside its full mask. */
export function countLabeled(raster: ObjectRaster, slot: number): number {
  return objectCounts(raster, slot, null).visible;
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
  const masks = slots.map((slot) => raster.full[slot] as MaskWindow).filter((mask) => mask.width > 0);
  if (masks.length === 0) return 0;
  const x0 = Math.max(range.i0, Math.min(...masks.map((mask) => mask.x0)));
  const y0 = Math.max(range.j0, Math.min(...masks.map((mask) => mask.y0)));
  const x1 = Math.min(range.i1, Math.max(...masks.map((mask) => mask.x0 + mask.width)));
  const y1 = Math.min(range.j1, Math.max(...masks.map((mask) => mask.y0 + mask.height)));
  if (x1 <= x0 || y1 <= y0) return 0;
  let count = 0;
  for (let j = y0; j < y1; j++) {
    for (let i = x0; i < x1; i++) {
      if (masks.some((mask) => covers(mask, i, j))) count += 1;
    }
  }
  return count;
}

function covers(mask: MaskWindow, x: number, y: number): boolean {
  const lx = x - mask.x0;
  const ly = y - mask.y0;
  if (lx < 0 || ly < 0 || lx >= mask.width || ly >= mask.height) return false;
  return mask.samples[ly * mask.width + lx] !== 0;
}

function clip(range: PixelRange, mask: MaskWindow): PixelRange {
  if (mask.width === 0 || mask.height === 0) return { i0: 0, j0: 0, i1: 0, j1: 0 };
  return {
    i0: Math.max(range.i0, mask.x0),
    j0: Math.max(range.j0, mask.y0),
    i1: Math.min(range.i1, mask.x0 + mask.width),
    j1: Math.min(range.j1, mask.y0 + mask.height),
  };
}

function eachPixel(width: number, range: PixelRange, visit: (pixel: number) => void): void {
  for (let j = range.j0; j < range.j1; j++) {
    const row = j * width;
    for (let i = range.i0; i < range.i1; i++) visit(row + i);
  }
}

/** Pixels set in a mask. */
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
