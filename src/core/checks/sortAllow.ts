import { EPS } from "../geometry";
import type { SortConsistencyCheck } from "../types";

/** One entry of `allow`, kept in the order and spelling of the check (SPEC 9.10). */
export type AllowEntry = string | readonly [string, string];

/** Which mismatches do not count, and which entries have already stopped one. */
export interface Allowance {
  readonly entries: readonly AllowEntry[];
  readonly blocked: ReadonlySet<string>;
  readonly pairs: ReadonlySet<string>;
  readonly used: Set<number>;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

/** `null` when the check has no `allow`, so the result has no `allowed`. */
export function buildAllowance(allow: SortConsistencyCheck["allow"]): Allowance | null {
  if (allow === undefined) return null;
  const entries: AllowEntry[] = allow.map((entry) => (typeof entry === "string" ? entry : [entry[0], entry[1]]));
  const blocked = new Set<string>();
  const pairs = new Set<string>();
  for (const entry of entries) {
    if (typeof entry === "string") blocked.add(entry);
    else pairs.add(pairKey(entry[0], entry[1]));
  }
  return { entries, blocked, pairs, used: new Set() };
}

/** Whether a static mismatch between `a` and `b` counts for each of them. */
export function staticSides(allowance: Allowance | null, a: string, b: string): { readonly a: boolean; readonly b: boolean } {
  if (allowance === null) return { a: true, b: true };
  if (allowance.pairs.has(pairKey(a, b))) return { a: false, b: false };
  return { a: !allowance.blocked.has(a), b: !allowance.blocked.has(b) };
}

/** An object id in `allow` drops that object's actor mismatches. A pair does not. */
export function actorCounts(allowance: Allowance | null, id: string): boolean {
  return allowance === null || !allowance.blocked.has(id);
}

function mark(allowance: Allowance, match: (entry: AllowEntry) => boolean): void {
  allowance.entries.forEach((entry, index) => {
    if (match(entry)) allowance.used.add(index);
  });
}

/** Remember the `allow` entries that stop this static mismatch, when its area is over the maximum. */
export function noteStatic(allowance: Allowance | null, a: string, b: string, area: number, maxPixels: number): void {
  if (allowance === null || !(area > maxPixels + EPS)) return;
  if (allowance.pairs.has(pairKey(a, b))) {
    const key = pairKey(a, b);
    mark(allowance, (entry) => typeof entry !== "string" && pairKey(entry[0], entry[1]) === key);
    return;
  }
  mark(allowance, (entry) => entry === a || entry === b);
}

/** Remember an object id that stops this actor mismatch, when its area is over the maximum. */
export function noteActor(allowance: Allowance | null, id: string, area: number, maxPixels: number): void {
  if (allowance === null || !(area > maxPixels + EPS) || !allowance.blocked.has(id)) return;
  mark(allowance, (entry) => entry === id);
}

/** Entries that stopped a mismatch, in the order they were written. */
export function allowedEntries(allowance: Allowance): readonly AllowEntry[] {
  return allowance.entries.filter((_, index) => allowance.used.has(index));
}
