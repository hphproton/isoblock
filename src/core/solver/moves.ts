import { round6 } from "../checks/result";
import type { Rect } from "../geometry";
import type { SolverModel } from "./model";
import type { Change, Term } from "./state";

/** Grid of the coordinates the solver changes (SPEC section 8). */
export const GRID = 0.05;
/** Step lengths of the pattern moves, coarse to fine; all multiples of the grid. */
const STEPS: readonly number[] = [6.4, 3.2, 1.6, 0.8, 0.4, 0.2, 0.1, 0.05];
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];
/** Connected sets larger than this are not moved as one group. */
const MAX_GROUP = 12;

/** Snap a coordinate to the grid, rounded to 6 decimals. */
export function snap(x: number): number {
  return round6(Math.round(x / GRID) * GRID) + 0;
}

/** Movable objects, the most constrained first (SPEC section 8, algorithm step 1). */
export function movableOrder(model: SolverModel, terms: readonly Term[]): number[] {
  const movable = model.origin.flatMap((_, i) => (model.freeU[i] || model.freeV[i] ? [i] : []));
  const count = (i: number, hardOnly: boolean) => terms.filter((t) => (!hardOnly || t.hard) && t.relation.objects.includes(i)).length;
  const key = new Map(movable.map((i) => [i, [count(i, true), count(i, false)] as const]));
  return movable.sort((a, b) => {
    const [ha, ta] = key.get(a) as readonly [number, number];
    const [hb, tb] = key.get(b) as readonly [number, number];
    return hb - ha || tb - ta || a - b;
  });
}

/** Groups moved together: the movable objects of each relation, and each connected set of them. */
export function groupsOf(model: SolverModel, terms: readonly Term[]): number[][] {
  const movable = (i: number) => model.freeU[i] || model.freeV[i];
  const parent = model.origin.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i] as number)));
  const groups = new Map<string, number[]>();
  for (const t of terms) {
    const members = t.relation.objects.filter(movable);
    if (members.length < 2) continue;
    groups.set(members.join(","), members);
    for (const m of members.slice(1)) parent[find(m)] = find(members[0] as number);
  }
  const sets = new Map<number, number[]>();
  model.origin.forEach((_, i) => {
    if (movable(i)) sets.set(find(i), [...(sets.get(find(i)) ?? []), i]);
  });
  for (const set of sets.values()) if (set.length > 1 && set.length <= MAX_GROUP) groups.set(set.join(","), set);
  return [...groups.values()];
}

/**
 * Translate `members` by whole steps; a member that cannot move along an axis keeps that
 * coordinate. `null` when no member moves.
 */
function translate(model: SolverModel, rects: readonly Rect[], members: readonly number[], du: number, dv: number): Change[] | null {
  const out: Change[] = [];
  for (const i of members) {
    const r = rects[i] as Rect;
    const u = du === 0 || !model.freeU[i] ? r.u0 : snap(r.u0 + du);
    const v = dv === 0 || !model.freeV[i] ? r.v0 : snap(r.v0 + dv);
    if (u !== r.u0 || v !== r.v0) out.push({ index: i, u, v });
  }
  return out.length === 0 ? null : out;
}

/** Pattern moves of one object or group, and for one object the way back to its start. */
export function candidates(model: SolverModel, rects: readonly Rect[], members: readonly number[]): Change[][] {
  const out: Change[][] = [];
  for (const step of STEPS) {
    for (const [du, dv] of DIRECTIONS) {
      const moves = translate(model, rects, members, du * step, dv * step);
      if (moves !== null) out.push(moves);
    }
  }
  if (members.length === 1) {
    const i = members[0] as number;
    const r = rects[i] as Rect;
    const o = model.origin[i] as Rect;
    if (model.freeU[i] && r.u0 !== o.u0) out.push([{ index: i, u: o.u0, v: r.v0 }]);
    if (model.freeV[i] && r.v0 !== o.v0) out.push([{ index: i, u: r.u0, v: o.v0 }]);
    if (r.u0 !== o.u0 && r.v0 !== o.v0 && model.freeU[i] && model.freeV[i]) out.push([{ index: i, u: o.u0, v: o.v0 }]);
  }
  return out;
}
