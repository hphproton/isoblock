/** Round to a number of decimals (half away from zero, as `toFixed` does for exact halves). */
export function round(x: number, decimals: number): number {
  return Number(x.toFixed(decimals)) + 0;
}
