import { round6 } from "../checks/result";
import type { Rect } from "../geometry";
import { followAssumptions } from "../patch/apply";
import { evaluateRelations, type RelationResult } from "../relations/evaluate";
import type { Scene, Vec2 } from "../types";
import { buildModel, type SolverModel } from "./model";
import { scoreOf, search } from "./search";

/** Perturbations after the first local optimum: for the proposal, and for each solution test of the conflict set. */
const PERTURBATIONS = 40;
const CONFLICT_PERTURBATIONS = 25;

export interface MovedObject {
  readonly id: string;
  readonly from: Vec2;
  readonly to: Vec2;
}

/** The report of SPEC section 8 (`--json`). */
export interface SolveReport {
  readonly scene: string;
  readonly status: "solved" | "conflict";
  readonly hardViolated: readonly string[];
  readonly softPenalty: number;
  readonly distance: number;
  readonly moved: readonly MovedObject[];
  readonly conflict: readonly string[];
  readonly relations: readonly RelationResult[];
}

export interface SolveOutcome {
  readonly report: SolveReport;
  /** The scene with the proposed positions. The input scene is never changed. */
  readonly proposal: Scene;
}

/**
 * Minimal conflict set by deletion filtering: start from all hard relations that are not
 * skipped; in file order, drop a relation when the solver still finds no solution without it.
 * A layout that solves one trial solves every smaller one, so solutions already found are tried
 * before a new search.
 */
export function minimalConflict(model: SolverModel, hard: readonly number[]): number[] {
  let set = [...hard];
  const solutions: (readonly Rect[])[] = [];
  for (const k of hard) {
    const options = { hard: set.filter((x) => x !== k), soft: false, perturbations: CONFLICT_PERTURBATIONS };
    if (solutions.some((rects) => scoreOf(model, options, rects).broken === 0)) continue;
    const found = search(model, options);
    if (found.score.broken > 0) set = options.hard;
    else solutions.push(found.rects);
  }
  return set;
}

/** The scene with the new positions; every assumption follows the value at its path (as `patch` does). */
function proposalOf(scene: Scene, rects: readonly Rect[]): Scene {
  const objects = scene.objects.map((o, i) => {
    const r = rects[i] as Rect;
    return r.u0 === o.pos[0] && r.v0 === o.pos[1] ? o : { ...o, pos: [r.u0, r.v0] as Vec2 };
  });
  return followAssumptions({ ...scene, objects }) as Scene;
}

function movedObjects(before: Scene, after: Scene): MovedObject[] {
  return before.objects.flatMap((o, i) => {
    const to = (after.objects[i] as Scene["objects"][number]).pos;
    return to === o.pos ? [] : [{ id: o.id, from: o.pos, to }];
  });
}

/**
 * Solve the relations of a valid scene (SPEC section 8): move the movable objects (only those
 * in `only`, when given) to grid positions that meet the hard relations and the view and overlap
 * constraints, with the smallest soft penalty and then the smallest distance. Deterministic.
 */
export function solveScene(scene: Scene, only?: readonly string[]): SolveOutcome {
  const model = buildModel(scene, only);
  const hard = model.relations.flatMap((p, k) => (p.hard && p.measure !== null ? [k] : []));
  const found = search(model, { hard, soft: true, perturbations: PERTURBATIONS });
  const solved = found.score.broken === 0;
  const conflict = solved ? [] : minimalConflict(model, hard).map((k) => model.relations[k]?.relation.id as string);
  const proposal = proposalOf(scene, found.rects);
  const moved = movedObjects(scene, proposal);
  const relations = evaluateRelations(proposal);
  const distance = moved.reduce((sum, m) => sum + Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1]), 0);
  return {
    proposal,
    report: {
      scene: scene.id,
      status: solved ? "solved" : "conflict",
      hardViolated: relations.results.filter((r) => r.hard && r.status === "violated").map((r) => r.id),
      softPenalty: round6(relations.softPenalty) + 0,
      distance: round6(distance) + 0,
      moved,
      conflict,
      relations: relations.results,
    },
  };
}
