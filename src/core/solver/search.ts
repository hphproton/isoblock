import type { Rect } from "../geometry";
import { SATISFIED } from "../relations/shared";
import { createLayout, type Layout } from "./layout";
import type { SolverModel } from "./model";
import { candidates, GRID, groupsOf, movableOrder, snap } from "./moves";
import { better, fullScore, pairPenalty, viewPenalty, type Change, type Score, type Term } from "./state";

const MAX_ROUNDS = 60;
const MAX_TRIES = 25;
const RADII: readonly number[] = [0.5, 1, 2, 4];
const SEED = 20260401;

export interface SearchOptions {
  /** Indexes into `model.relations` of the hard relations to meet. */
  readonly hard: readonly number[];
  /** Whether soft relations count; without them the search only looks for a solution. */
  readonly soft: boolean;
  /** Number of perturbations tried after the first local optimum. */
  readonly perturbations: number;
}

export interface SearchResult {
  readonly rects: readonly Rect[];
  readonly score: Score;
}

/** The score of fixed footprints for a set of hard relations (and the soft ones when they count). */
export function scoreOf(model: SolverModel, options: SearchOptions, rects: readonly Rect[]): Score {
  return fullScore(model, termsOf(model, options), rects);
}

/** Deterministic pseudo-random numbers in [0, 1) (mulberry32). */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The terms the search measures: the chosen hard relations, and the soft ones when they count. */
function termsOf(model: SolverModel, options: SearchOptions): Term[] {
  const hard = new Set(options.hard);
  return model.relations.flatMap<Term>((relation, k) => {
    if (relation.measure === null) return [];
    if (relation.hard) return hard.has(k) ? [{ relation, hard: true }] : [];
    return options.soft ? [{ relation, hard: false }] : [];
  });
}

/** Apply the best candidate move of `members` when it improves the score. */
function improve(model: SolverModel, layout: Layout, members: readonly number[]): boolean {
  let best = layout.score();
  let choice: Change[] | null = null;
  for (const moves of candidates(model, layout.rects, members)) {
    const score = layout.evaluate(moves);
    if (better(score, best)) {
      best = score;
      choice = moves;
    }
  }
  if (choice !== null) layout.apply(choice);
  return choice !== null;
}

/** Improve object by object, then group by group, until nothing improves. */
function localSearch(model: SolverModel, layout: Layout, order: readonly number[], groups: readonly number[][], soft: boolean): void {
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let improved = false;
    for (const i of order) {
      for (let k = 0; k < MAX_TRIES && improve(model, layout, [i]); k++) improved = true;
      if (!soft && layout.score().broken === 0) return;
    }
    if (!improved) for (const g of groups) improved = improve(model, layout, g) || improved;
    layout.reset(layout.rects);
    if (!improved || (!soft && layout.score().broken === 0)) return;
  }
}

/** Objects to shake: those in broken hard relations or constraints, else those in violated soft relations. */
function culprits(model: SolverModel, terms: readonly Term[], rects: readonly Rect[], broken: boolean): number[] {
  const out = new Set<number>();
  for (const t of terms) {
    if (t.hard !== broken) continue;
    const v = (t.relation.measure as NonNullable<Term["relation"]["measure"]>).violation(rects);
    if (v > SATISFIED) t.relation.objects.forEach((i) => out.add(i));
  }
  if (broken) {
    rects.forEach((_, i) => {
      if (viewPenalty(model, rects, i) > 0) out.add(i);
      for (let j = i + 1; j < rects.length; j++) if (pairPenalty(model, rects, i, j) > 0) out.add(i).add(j);
    });
  }
  return [...out].filter((i) => model.freeU[i] || model.freeV[i]).sort((a, b) => a - b);
}

function done(score: Score, soft: boolean): boolean {
  return score.broken === 0 && (!soft || score.soft <= 1e-9);
}

/**
 * Search for positions that meet the hard relations and constraints, then lower the soft penalty,
 * then the distance moved (SPEC section 8). Deterministic: no clock, a fixed seed.
 */
export function search(model: SolverModel, options: SearchOptions): SearchResult {
  const terms = termsOf(model, options);
  const order = movableOrder(model, terms);
  const groups = groupsOf(model, terms);
  const layout = createLayout(model, terms);
  localSearch(model, layout, order, groups, options.soft);
  let best: SearchResult = { rects: [...layout.rects], score: layout.score() };
  const next = random(SEED);
  for (let k = 0; k < options.perturbations && !done(best.score, options.soft); k++) {
    layout.reset(best.rects);
    const all = culprits(model, terms, best.rects, best.score.broken > 0);
    if (all.length === 0) break;
    const some = all.filter(() => next() < 0.5);
    const shake = some.length > 0 ? some : [all[Math.floor(next() * all.length)] as number];
    const radius = RADII[Math.floor(next() * RADII.length)] as number;
    const offset = () => Math.round((next() * 2 - 1) * (radius / GRID)) * GRID;
    layout.apply(shake.map((i) => {
      const r = layout.rects[i] as Rect;
      return { index: i, u: model.freeU[i] ? snap(r.u0 + offset()) : r.u0, v: model.freeV[i] ? snap(r.v0 + offset()) : r.v0 };
    }));
    localSearch(model, layout, order, groups, options.soft);
    if (better(layout.score(), best.score)) best = { rects: [...layout.rects], score: layout.score() };
  }
  return best;
}
