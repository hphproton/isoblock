import { round6 } from "../checks/result";
import { footprint } from "../geometry";
import { pointerTokens } from "../pointer";
import type { Pos, Rot, Scene, SceneObject } from "../types";
import { buildModel } from "./model";
import { snap } from "./moves";
import { posForRotation } from "./place";
import type { SolveOutcome } from "./solve";

const ROTS: readonly Rot[] = [0, 90, 180, 270];

type Solve = (scene: Scene, only?: readonly string[]) => SolveOutcome;

function covers(pointer: string, target: readonly string[]): boolean {
  const tokens = pointerTokens(pointer);
  return tokens.length <= target.length && tokens.every((token, index) => token === target[index]);
}

function underPos(pointer: string, index: number): boolean {
  const tokens = pointerTokens(pointer);
  const pos = ["objects", String(index), "pos"];
  return tokens.length > pos.length && pos.every((token, index) => tokens[index] === token);
}

/** Movable objects the solver may turn (SPEC section 8). */
function turnableIndexes(scene: Scene, only?: readonly string[]): number[] {
  const model = buildModel(scene, only);
  const pointers = scene.objects.flatMap((object) => (object.locks ?? []).filter((lock) => lock.startsWith("/")));
  return scene.objects.flatMap((object, index) => {
    if (!model.freeU[index] || !model.freeV[index]) return [];
    if ((object.locks ?? []).includes("rot")) return [];
    const rot = ["objects", String(index), "rot"];
    if (pointers.some((pointer) => covers(pointer, rot) || underPos(pointer, index))) return [];
    return [index];
  });
}

/** A coordinate the turn changes lands on the grid. One it does not change keeps its value. */
function gridPos(before: Pos, after: Pos): Pos {
  const u = after[0] === before[0] ? after[0] : snap(after[0]);
  const v = after[1] === before[1] ? after[1] : snap(after[1]);
  const h = (after as readonly number[])[2];
  return h === undefined ? [u, v] : [u, v, h];
}

function withRotations(scene: Scene, rots: readonly number[]): Scene {
  const objects = scene.objects.map((object, index) => {
    const rot = (rots[index] ?? object.rot ?? 0) as Rot;
    if (rot === (object.rot ?? 0)) return object;
    return { ...object, rot, pos: gridPos(object.pos, posForRotation(scene, object, rot)) };
  });
  return { ...scene, objects };
}

function assignments(scene: Scene, indexes: readonly number[]): number[][] {
  const base = scene.objects.map((object) => object.rot ?? 0);
  const out: number[][] = [];
  const fill = (at: number, current: number[]): void => {
    if (at === indexes.length) {
      out.push(current.slice());
      return;
    }
    const index = indexes[at] as number;
    for (const rot of ROTS) {
      current[index] = rot;
      fill(at + 1, current);
    }
  };
  if (indexes.length <= 3) {
    fill(0, base.slice());
    return out;
  }
  out.push(base.slice());
  for (const index of indexes) {
    for (const rot of ROTS) {
      if (rot === (base[index] ?? 0)) continue;
      const next = base.slice();
      next[index] = rot;
      out.push(next);
    }
  }
  return out;
}

function center(scene: Scene, index: number): readonly [number, number] {
  const box = footprint(scene, scene.objects[index] as SceneObject);
  return [(box.u0 + box.u1) / 2, (box.v0 + box.v1) / 2];
}

function centerDistance(before: Scene, after: Scene): number {
  let sum = 0;
  for (let i = 0; i < before.objects.length; i++) {
    const a = center(before, i);
    const b = center(after, i);
    sum += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return round6(sum) + 0;
}

interface Ranked {
  readonly outcome: SolveOutcome;
  readonly turns: number;
  readonly distance: number;
}

function better(a: Ranked, b: Ranked): boolean {
  const as = a.outcome.report.status === "solved" ? 0 : 1;
  const bs = b.outcome.report.status === "solved" ? 0 : 1;
  if (as !== bs) return as < bs;
  if (a.outcome.report.softPenalty < b.outcome.report.softPenalty - 1e-9) return true;
  if (a.outcome.report.softPenalty > b.outcome.report.softPenalty + 1e-9) return false;
  if (a.distance < b.distance - 1e-9) return true;
  if (a.distance > b.distance + 1e-9) return false;
  return a.turns < b.turns;
}

export interface RotationOutcome {
  readonly proposal: Scene;
  readonly report: SolveOutcome["report"];
  readonly distance: number;
}

/**
 * The best layout among the rotations of the turnable objects (SPEC section 8). The caller
 * fills `turned` and the conflict set. `distance` is between footprint centers.
 */
export function solveWithRotation(scene: Scene, only: readonly string[] | undefined, solve: Solve): RotationOutcome {
  const indexes = turnableIndexes(scene, only);
  const runs = indexes.length === 0 ? [scene.objects.map((object) => object.rot ?? 0)] : assignments(scene, indexes);
  let best: Ranked | null = null;
  for (const rots of runs) {
    const outcome = solve(withRotations(scene, rots), only);
    const turns = rots.reduce((sum, rot, index) => sum + (rot === (scene.objects[index]?.rot ?? 0) ? 0 : 1), 0);
    const ranked: Ranked = { outcome, turns, distance: centerDistance(scene, outcome.proposal) };
    if (best === null || better(ranked, best)) best = ranked;
  }
  const found = best as Ranked;
  return { proposal: found.outcome.proposal, report: found.outcome.report, distance: found.distance };
}
