import type { Rect } from "../geometry";
import type { PreparedRelation } from "../relations/prepare";
import type { SolverModel } from "./model";
import { contribution, fullScore, pairPenalty, travel, viewPenalty, type Change, type Score, type Term } from "./state";

/**
 * Positions under search, with the score kept up to date per change. Only the search uses it;
 * it mutates its own arrays and nothing else.
 */
export interface Layout {
  readonly rects: readonly Rect[];
  score(): Score;
  /** The score after `changes`, without keeping them. */
  evaluate(changes: readonly Change[]): Score;
  apply(changes: readonly Change[]): void;
  /** Replace every footprint and recompute the score from scratch. */
  reset(rects: readonly Rect[]): void;
}

function violationOf(term: Term, rects: readonly Rect[]): number {
  return (term.relation.measure as NonNullable<PreparedRelation["measure"]>).violation(rects);
}

export function createLayout(model: SolverModel, terms: readonly Term[]): Layout {
  const n = model.origin.length;
  const rects: Rect[] = [...model.origin];
  // Footprint extents after rotation, so that a moved footprint has the same arithmetic as `footprint`.
  const extents = model.scene.objects.map((o) => {
    const [w, d] = model.scene.types[o.type]?.size ?? [0, 0, 0];
    return o.rot === 90 || o.rot === 270 ? ([d, w] as const) : ([w, d] as const);
  });
  const termsOf: number[][] = rects.map(() => []);
  terms.forEach((t, k) => t.relation.objects.forEach((i) => termsOf[i]?.push(k)));
  const termValue = new Float64Array(terms.length);
  const viewValue = new Float64Array(n);
  const travelValue = new Float64Array(n);
  const termStamp = new Int32Array(terms.length);
  const changedAt = new Int32Array(n);
  // Overlap penalty and count of the pairs of each object, for the fast path of one change.
  const pairSum = new Float64Array(n);
  const pairCount = new Int32Array(n);
  let stamp = 0;
  let total: Score = { primary: 0, broken: 0, soft: 0, distance: 0 };

  const rectAt = (i: number, u: number, v: number): Rect => {
    const [eu, ev] = extents[i] as readonly [number, number];
    return { u0: u, v0: v, u1: u + eu, v1: v + ev };
  };

  function refreshPairs(): void {
    pairSum.fill(0);
    pairCount.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const p = pairPenalty(model, rects, i, j);
        if (p === 0) continue;
        pairSum[i] += p;
        pairSum[j] += p;
        pairCount[i]++;
        pairCount[j]++;
      }
    }
  }

  function reset(next: readonly Rect[]): void {
    next.forEach((r, i) => (rects[i] = r));
    refreshPairs();
    terms.forEach((t, k) => (termValue[k] = contribution(t, violationOf(t, rects))));
    for (let i = 0; i < n; i++) {
      viewValue[i] = viewPenalty(model, rects, i);
      travelValue[i] = travel(model, rects, i);
    }
    total = fullScore(model, terms, rects);
  }

  /** Score after `changes`; with `keep`, the changes and the new values stay. */
  function change(changes: readonly Change[], keep: boolean): Score {
    stamp++;
    changes.forEach((c, k) => (changedAt[c.index] = k + 1));
    const affected: number[] = [];
    for (const c of changes) {
      for (const t of termsOf[c.index] as number[]) {
        if (termStamp[t] !== stamp) {
          termStamp[t] = stamp;
          affected.push(t);
        }
      }
    }
    let primary = total.primary;
    let broken = total.broken;
    let soft = total.soft;
    let distance = total.distance;
    const pairs = (sign: number) => {
      changes.forEach((c, k) => {
        for (let j = 0; j < n; j++) {
          const at = changedAt[j] as number;
          if (j === c.index || (at > 0 && at - 1 < k)) continue;
          const p = pairPenalty(model, rects, c.index, j);
          if (p > 0) {
            primary += sign * p;
            broken += sign;
          }
        }
      });
    };
    pairs(-1);
    const saved = changes.map((c) => rects[c.index] as Rect);
    for (const c of changes) rects[c.index] = rectAt(c.index, c.u, c.v);
    const values = affected.map((t) => contribution(terms[t] as Term, violationOf(terms[t] as Term, rects)));
    affected.forEach((t, k) => {
      const before = termValue[t] as number;
      const after = values[k] as number;
      if ((terms[t] as Term).hard) {
        primary += after - before;
        broken += (after > 0 ? 1 : 0) - (before > 0 ? 1 : 0);
      } else soft += after - before;
    });
    const views = changes.map((c) => viewPenalty(model, rects, c.index));
    const travels = changes.map((c) => travel(model, rects, c.index));
    changes.forEach((c, k) => {
      const before = viewValue[c.index] as number;
      const after = views[k] as number;
      primary += after - before;
      broken += (after > 0 ? 1 : 0) - (before > 0 ? 1 : 0);
      distance += (travels[k] as number) - (travelValue[c.index] as number);
    });
    pairs(1);
    for (const c of changes) changedAt[c.index] = 0;
    const score = { primary: broken === 0 ? 0 : primary, broken, soft, distance };
    if (!keep) {
      changes.forEach((c, k) => (rects[c.index] = saved[k] as Rect));
      return score;
    }
    affected.forEach((t, k) => (termValue[t] = values[k] as number));
    changes.forEach((c, k) => {
      viewValue[c.index] = views[k] as number;
      travelValue[c.index] = travels[k] as number;
    });
    refreshPairs();
    total = score;
    return score;
  }

  /** `change([c], false)` without allocations: the score after moving one object. */
  function evaluateOne(c: Change): Score {
    const i = c.index;
    let primary = total.primary - (pairSum[i] as number) - (viewValue[i] as number);
    let broken = total.broken - (pairCount[i] as number) - ((viewValue[i] as number) > 0 ? 1 : 0);
    let soft = total.soft;
    const saved = rects[i] as Rect;
    rects[i] = rectAt(i, c.u, c.v);
    for (const t of termsOf[i] as number[]) {
      const term = terms[t] as Term;
      const before = termValue[t] as number;
      const after = contribution(term, violationOf(term, rects));
      if (term.hard) {
        primary += after - before;
        broken += (after > 0 ? 1 : 0) - (before > 0 ? 1 : 0);
      } else soft += after - before;
    }
    const view = viewPenalty(model, rects, i);
    primary += view;
    if (view > 0) broken++;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const p = pairPenalty(model, rects, i, j);
      if (p > 0) {
        primary += p;
        broken++;
      }
    }
    const distance = total.distance - (travelValue[i] as number) + travel(model, rects, i);
    rects[i] = saved;
    return { primary: broken === 0 ? 0 : primary, broken, soft, distance };
  }

  reset(model.origin);
  return {
    rects,
    score: () => total,
    evaluate: (changes) => (changes.length === 1 ? evaluateOne(changes[0] as Change) : change(changes, false)),
    apply: (changes) => void change(changes, true),
    reset,
  };
}
