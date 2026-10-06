/** 2 decimals; up to 4 when 2 would lose information (SPEC Appendix B). */
export function fmt(n: number): string {
  let text = n.toFixed(4);
  for (let digits = 2; digits <= 4; digits++) {
    const candidate = n.toFixed(digits);
    if (Math.abs(Number(candidate) - n) < 1e-9) {
      text = candidate;
      break;
    }
  }
  return /^-0\.0+$/.test(text) ? text.slice(1) : text;
}

/** A number without trailing zeros, at most 4 decimals: `150`, `20.5`. */
export function plain(n: number): string {
  return String(Number(n.toFixed(4)));
}

/** Fraction 0..1 as a whole percentage. */
export function percent(fraction: number): number {
  return Math.round(fraction * 100);
}
