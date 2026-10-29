import { round6 } from "../checks/result";
import type { Rect } from "../geometry";
import { followAssumptions } from "../patch/apply";
import { evaluateRelations, type RelationResult } from "../relations/evaluate";
import type { Pos, Rot, Scene } from "../types";
import { buildModel, type SolverModel } from "./model";
import { solveWithRotation } from "./rotate";
import { scoreOf, search, type SearchResult } from "./search";

/** Perturbations after the first local optimum: for the proposal, and for each solution test of the conflict set. */
const PERTURBATIONS = 40;
const CONFLICT_PERTURBATIONS = 25;

export interface MovedObject {
  readonly id: string;
  readonly from: Pos;
  readonly to: Pos;
}

export interface TurnedObject {
  readonly id: string;
  readonly from: Rot;
  readonly to: Rot;
}

/** The report of SPEC section 8 (`--json`). */
export interface SolveReport {
  readonly scene: string;
  readonly status: "solved" | "conflict";
  readonly hardViolated: readonly string[];
  readonly softPenalty: number;
  readonly distance: number;
  readonly moved: readonly MovedObject[];
  /** Present when the solve used `--rotate`: the objects whose `rot` changed, in object order. */
  readonly turned?: readonly TurnedObject[];
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
    if (r.u0 === o.pos[0] && r.v0 === o.pos[1]) return o;
    const h = (o.pos as readonly number[])[2];
    const pos: Pos = h === undefined ? [r.u0, r.v0] : [r.u0, r.v0, h];
    return { ...o, pos };
  });
  return followAssumptions({ ...scene, objects }) as Scene;
}

function samePos(a: Pos, b: Pos): boolean {
  return a[0] === b[0] && a[1] === b[1] && (a as readonly number[])[2] === (b as readonly number[])[2];
}

function movedObjects(before: Scene, after: Scene): MovedObject[] {
  return before.objects.flatMap((o, i) => {
    const to = (after.objects[i] as Scene["objects"][number]).pos;
    return samePos(o.pos, to) ? [] : [{ id: o.id, from: o.pos, to }];
  });
}

function turnedObjects(before: Scene, after: Scene): TurnedObject[] {
  return before.objects.flatMap((object, index) => {
    const from = object.rot ?? 0;
    const to = (after.objects[index] as Scene["objects"][number]).rot ?? 0;
    return from === to ? [] : [{ id: object.id, from, to }];
  });
}

function hardIndexes(model: SolverModel): number[] {
  return model.relations.flatMap((relation, index) => (relation.hard && relation.measure !== null ? [index] : []));
}

interface Pass {
  readonly hard?: readonly number[];
  readonly soft: boolean;
  readonly perturbations: number;
  /** Input scene when `scene` already carries a turn. */
  readonly baseline?: Scene;
}

function run(scene: Scene, only: readonly string[] | undefined, pass: Pass): { model: SolverModel; found: SearchResult; proposal: Scene } {
  const model = buildModel(scene, only, pass.baseline);
  const hard = pass.hard ?? hardIndexes(model);
  const found = search(model, { hard, soft: pass.soft, perturbations: pass.perturbations });
  return { model, found, proposal: proposalOf(scene, found.rects) };
}

/** One rotation assignment, scored against the input. The caller fills the conflict set. */
function passOutcome(
  scene: Scene,
  only: readonly string[] | undefined,
  baseline: Scene,
  hard: readonly number[] | undefined,
  probing: boolean,
): SolveOutcome {
  const { found, proposal } = run(scene, only, {
    soft: !probing,
    perturbations: probing ? CONFLICT_PERTURBATIONS : PERTURBATIONS,
    baseline,
    ...(hard === undefined ? {} : { hard }),
  });
  const relations = evaluateRelations(proposal);
  return {
    proposal,
    report: {
      scene: baseline.id,
      status: found.score.broken === 0 ? "solved" : "conflict",
      hardViolated: [],
      softPenalty: round6(relations.softPenalty) + 0,
      distance: 0,
      moved: [],
      conflict: [],
      relations: relations.results,
    },
  };
}

/** True when `proposal` meets `hard` and the constraints of the input scene. */
function holds(baseline: Scene, proposal: Scene, only: readonly string[] | undefined, hard: readonly number[]): boolean {
  const model = buildModel(proposal, only, baseline);
  return scoreOf(model, { hard, soft: false, perturbations: 0 }, model.origin).broken === 0;
}

/**
 * Minimal conflict set with the rotating solver (SPEC section 8). A layout that solves one
 * trial solves every smaller one, so a solution already found is tried before a new search.
 */
function rotationConflict(scene: Scene, only: readonly string[] | undefined, hard: readonly number[]): number[] {
  let set = [...hard];
  const solved: Scene[] = [];
  for (const k of hard) {
    const trial = set.filter((index) => index !== k);
    if (solved.some((proposal) => holds(scene, proposal, only, trial))) continue;
    const found = solveWithRotation(scene, only, (rotated, ids) => passOutcome(rotated, ids, scene, trial, true));
    if (found.report.status === "solved") solved.push(found.proposal);
    else set = trial;
  }
  return set;
}

/**
 * Solve the relations of a valid scene (SPEC section 8): move the movable objects (only those
 * in `only`, when given) to grid positions that meet the hard relations and the view and overlap
 * constraints, with the smallest soft penalty and then the smallest distance. Deterministic.
 */
export function solveScene(scene: Scene, only?: readonly string[], rotate = false): SolveOutcome {
  if (rotate) return solveRotated(scene, only);
  return solveFixed(scene, only);
}

function solveRotated(scene: Scene, only?: readonly string[]): SolveOutcome {
  const found = solveWithRotation(scene, only, (rotated, ids) => passOutcome(rotated, ids, scene, undefined, false));
  const proposal = found.proposal;
  const relations = evaluateRelations(proposal);
  const solved = found.report.status === "solved";
  const model = buildModel(scene, only);
  const hard = hardIndexes(model);
  const conflict = solved ? [] : rotationConflict(scene, only, hard).map((index) => model.relations[index]?.relation.id as string);
  return {
    proposal,
    report: {
      scene: scene.id,
      status: solved ? "solved" : "conflict",
      hardViolated: relations.results.filter((result) => result.hard && result.status === "violated").map((result) => result.id),
      softPenalty: round6(relations.softPenalty) + 0,
      distance: found.distance,
      moved: movedObjects(scene, proposal),
      turned: turnedObjects(scene, proposal),
      conflict,
      relations: relations.results,
    },
  };
}

function solveFixed(scene: Scene, only?: readonly string[]): SolveOutcome {
  const { model, found, proposal } = run(scene, only, { soft: true, perturbations: PERTURBATIONS });
  const hard = hardIndexes(model);
  const solved = found.score.broken === 0;
  const conflict = solved ? [] : minimalConflict(model, hard).map((k) => model.relations[k]?.relation.id as string);
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
