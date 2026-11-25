import type { MaskWindow } from "./raster";

/** Chebyshev dilation by `n` pixels, staying inside the raster (SPEC 14.1). `n` of 0 returns `mask`. */
export function growWindow(mask: MaskWindow, rasterWidth: number, rasterHeight: number, n: number): MaskWindow {
  if (n <= 0 || mask.width === 0 || mask.height === 0) return mask;
  const x0 = Math.max(0, mask.x0 - n);
  const y0 = Math.max(0, mask.y0 - n);
  const x1 = Math.min(rasterWidth, mask.x0 + mask.width + n);
  const y1 = Math.min(rasterHeight, mask.y0 + mask.height + n);
  const width = Math.max(0, x1 - x0);
  const height = Math.max(0, y1 - y0);
  const samples = new Uint8Array(width * height);
  for (let y = 0; y < mask.height; y++) {
    const row = y * mask.width;
    for (let x = 0; x < mask.width; x++) {
      if (mask.samples[row + x] === 0) continue;
      const gx = mask.x0 + x;
      const gy = mask.y0 + y;
      const ax0 = Math.max(x0, gx - n);
      const ay0 = Math.max(y0, gy - n);
      const ax1 = Math.min(x1 - 1, gx + n);
      const ay1 = Math.min(y1 - 1, gy + n);
      for (let yy = ay0; yy <= ay1; yy++) {
        const local = (yy - y0) * width;
        samples.fill(1, local + (ax0 - x0), local + (ax1 - x0) + 1);
      }
    }
  }
  return { x0, y0, width, height, samples };
}

/** `[x0, y0, x1, y1]` from the first set pixel to one past the last, or null when none is set. */
export function windowBox(mask: MaskWindow): readonly [number, number, number, number] | null {
  let x0 = mask.width;
  let y0 = mask.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < mask.height; y++) {
    const row = y * mask.width;
    for (let x = 0; x < mask.width; x++) {
      if (mask.samples[row + x] === 0) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : [mask.x0 + x0, mask.y0 + y0, mask.x0 + x1 + 1, mask.y0 + y1 + 1];
}

/** The mask cropped to `box`, with 255 where it is set and 0 elsewhere. */
export function cropWindow(mask: MaskWindow, box: readonly [number, number, number, number]): Uint8Array {
  const [x0, y0, x1, y1] = box;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const out = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    const src = (y0 - mask.y0 + y) * mask.width + (x0 - mask.x0);
    const dst = y * bw;
    for (let x = 0; x < bw; x++) if (mask.samples[src + x] !== 0) out[dst + x] = 255;
  }
  return out;
}
