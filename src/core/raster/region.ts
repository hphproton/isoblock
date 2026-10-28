/** Half-open pixel range of a frame rect, or of the whole raster (SPEC 9.6). */
export interface PixelRange {
  /** First column, inclusive. */
  readonly i0: number;
  /** One past the last column. */
  readonly i1: number;
  /** First row, inclusive. */
  readonly j0: number;
  readonly j1: number;
}

/**
 * Pixels whose centers (i + 0.5, j + 0.5) satisfy x0 <= x < x1 and y0 <= y < y1, clipped to the
 * raster. Without a rect, every pixel. Regions that share an edge share no pixel.
 */
export function pixelRange(
  width: number,
  height: number,
  rect: readonly [number, number, number, number] | null,
): PixelRange {
  if (rect === null) return { i0: 0, i1: width, j0: 0, j1: height };
  const [x0, y0, x1, y1] = rect;
  const i0 = Math.max(0, Math.ceil(x0 - 0.5));
  const j0 = Math.max(0, Math.ceil(y0 - 0.5));
  const i1 = Math.min(width, Math.ceil(x1 - 0.5));
  const j1 = Math.min(height, Math.ceil(y1 - 0.5));
  return { i0, i1: Math.max(i0, i1), j0, j1: Math.max(j0, j1) };
}

/** Number of pixels in the range. */
export function rangeCount(range: PixelRange): number {
  return (range.i1 - range.i0) * (range.j1 - range.j0);
}
