/** Chebyshev dilation by `n` pixels, staying inside the raster (SPEC 14.1). `n` of 0 returns `mask`. */
export function growMask(mask: Uint8Array, width: number, height: number, n: number): Uint8Array {
  if (n <= 0) return mask;
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const y0 = Math.max(0, y - n);
    const y1 = Math.min(height - 1, y + n);
    for (let x = 0; x < width; x++) {
      if (mask[row + x] === 0) continue;
      const x0 = Math.max(0, x - n);
      const x1 = Math.min(width - 1, x + n);
      for (let yy = y0; yy <= y1; yy++) out.fill(1, yy * width + x0, yy * width + x1 + 1);
    }
  }
  return out;
}

/** `[x0, y0, x1, y1]` from the first set pixel to one past the last, or null when none is set. */
export function maskBox(mask: Uint8Array, width: number, height: number): readonly [number, number, number, number] | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[row + x] === 0) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}

/** The mask cropped to `box`, with 255 where it is set and 0 elsewhere. */
export function cropMask(mask: Uint8Array, width: number, box: readonly [number, number, number, number]): Uint8Array {
  const [x0, y0, x1, y1] = box;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const out = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    const from = (y0 + y) * width + x0;
    const to = y * bw;
    for (let x = 0; x < bw; x++) if (mask[from + x] !== 0) out[to + x] = 255;
  }
  return out;
}
