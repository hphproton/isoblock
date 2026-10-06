import { EPS, type Rect } from "../geometry";
import type { PreparedRelation } from "../relations/prepare";
import { overlapAmount, SATISFIED } from "../relations/shared";
import type { SolverModel } from "./model";

/** The objective of SPEC section 8, compared in this order. `broken` counts what makes `primary` positive. */
export interface Score {
  /** Violations of hard relations plus broken constraints; 0 exactly when nothing is broken. */
  readonly primary: number;
  readonly broken: number;
  readonly soft: number;
  readonly distance: number;
}

const TOL = 1e-9;

/** True when `a` is better than `b`: smaller primary, then soft penalty, then distance. */
export function better(a: Score, b: Score): boolean {
  if (a.primary < b.primary - TOL) return true;
  if (a.primary > b.primary + TOL) return false;
  if (a.soft < b.soft - TOL) return true;
  if (a.soft > b.soft + TOL) return false;
  return a.distance < b.distance - TOL;
}

/** A relation the search measures: hard ones add to `primary`, soft ones to `soft`. */
export interface Term {
  readonly relation: PreparedRelation;
  readonly hard: boolean;
}

/** One object moved to a new `pos`. */
export interface Change {
  readonly index: number;
  readonly u: number;
  readonly v: number;
}

function moved(model: SolverModel, rects: readonly Rect[], i: number): boolean {
  const r = rects[i] as Rect;
  const o = model.origin[i] as Rect;
  return r.u0 !== o.u0 || r.v0 !== o.v0;
}

/** View constraint of one object: total distance of its corners outside the view region, in units. */
export function viewPenalty(model: SolverModel, rects: readonly Rect[], i: number): number {
  if (!moved(model, rects, i)) return 0;
  if (model.view === null) return 1;
  const [x0, y0, x1, y1] = model.view;
  const r = rects[i] as Rect;
  let px = 0;
  const corner = (u: number, v: number) => {
    const [x, y] = model.project(u, v);
    px += Math.max(0, x0 - x, x - x1) + Math.max(0, y0 - y, y - y1);
  };
  corner(r.u0, r.v0);
  corner(r.u1, r.v0);
  corner(r.u1, r.v1);
  corner(r.u0, r.v1);
  return px > EPS ? px / model.scene.camera.pxPerUnit : 0;
}

/** Overlap constraint of one pair: a moved footprint must not overlap another unless the two overlapped before. */
export function pairPenalty(model: SolverModel, rects: readonly Rect[], i: number, j: number): number {
  const amount = overlapAmount(rects[i] as Rect, rects[j] as Rect);
  if (amount === 0) return 0;
  const n = rects.length;
  if (model.overlappedBefore.has(i < j ? i * n + j : j * n + i)) return 0;
  return moved(model, rects, i) || moved(model, rects, j) ? amount : 0;
}

/** Contribution of one term with violation `v`: to primary for a hard relation, to the soft penalty otherwise. */
export function contribution(term: Term, v: number): number {
  if (term.hard) return v > SATISFIED ? v : 0;
  return term.relation.weight * v;
}

/** Distance of an object from where it started. */
export function travel(model: SolverModel, rects: readonly Rect[], i: number): number {
  const r = rects[i] as Rect;
  const o = model.origin[i] as Rect;
  return Math.hypot(r.u0 - o.u0, r.v0 - o.v0);
}

/** The whole score of a layout, computed from scratch. */
export function fullScore(model: SolverModel, terms: readonly Term[], rects: readonly Rect[]): Score {
  let primary = 0;
  let broken = 0;
  let soft = 0;
  let distance = 0;
  for (const t of terms) {
    const c = contribution(t, (t.relation.measure as NonNullable<PreparedRelation["measure"]>).violation(rects));
    if (t.hard) {
      primary += c;
      if (c > 0) broken++;
    } else soft += c;
  }
  for (let i = 0; i < rects.length; i++) {
    const view = viewPenalty(model, rects, i);
    primary += view;
    if (view > 0) broken++;
    distance += travel(model, rects, i);
    for (let j = i + 1; j < rects.length; j++) {
      const overlap = pairPenalty(model, rects, i, j);
      primary += overlap;
      if (overlap > 0) broken++;
    }
  }
  return { primary: broken === 0 ? 0 : primary, broken, soft, distance };
}
