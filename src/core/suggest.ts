/**
 * Nearest known name within Levenshtein distance 2 (SPEC section 6).
 * Distance counts insertions, deletions and substitutions of code points.
 * On a tie the first name in the pool wins.
 */
export function suggest(typed: string, pool: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = 3;
  for (const name of pool) {
    const distance = levenshtein(typed, name);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = name;
    }
  }
  return bestDistance <= 2 ? best : undefined;
}

/** The suffix of a detail that names an unknown value, or `""` when nothing is close enough. */
export function hint(typed: string, pool: readonly string[]): string {
  const name = suggest(typed, pool);
  return name === undefined ? "" : ` (did you mean "${name}"?)`;
}

/** Distance, or 3 when it is greater than 2 (callers only keep a distance of at most 2). */
function levenshtein(a: string, b: string): number {
  const s = Array.from(a);
  const t = Array.from(b);
  if (Math.abs(s.length - t.length) > 2) return 3;
  const prev = new Array<number>(t.length + 1);
  const next = new Array<number>(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;
  for (let i = 1; i <= s.length; i++) {
    next[0] = i;
    let rowMin = i;
    const si = s[i - 1];
    for (let j = 1; j <= t.length; j++) {
      const cost = si === t[j - 1] ? 0 : 1;
      const d = Math.min((prev[j] as number) + 1, (next[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
      next[j] = d;
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > 2) return 3;
    for (let j = 0; j <= t.length; j++) prev[j] = next[j] as number;
  }
  return prev[t.length] as number;
}
