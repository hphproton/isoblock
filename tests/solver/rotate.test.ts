import { describe, expect, it } from "vitest";
import { footprint, rectsOverlap } from "../../src/core/geometry";
import { runPatch } from "../../src/core/patch/outcome";
import { serializeScene } from "../../src/core/serialize";
import { solvePatch } from "../../src/core/solver/report";
import { solveScene } from "../../src/core/solver/solve";
import type { Scene } from "../../src/core/types";
import { validateScene } from "../../src/core/validate";
import { expectConstraints, onGrid } from "../helpers/solver";

const camera = { angleU: 30, angleV: 150, pxPerUnit: 50, verticalScale: 1, origin: [480, 120] };
const frame = { w: 1000, h: 700, regions: [{ id: "view", rect: [0, 0, 1000, 700] }] };

function stageScene(body: Record<string, unknown>): Scene {
  return validateScene({ schema: "isoblock/1", id: "turn-fix", units: { name: "u" }, camera, frame, ...body });
}

/** `--patch` applied to the input is the file `-o` writes. */
function sameFile(scene: Scene): void {
  const { report, proposal } = solveScene(scene, undefined, true);
  const patched = runPatch(scene, solvePatch(scene, report));
  expect(patched.status).toBe("applied");
  expect(serializeScene(patched.result as Scene)).toBe(serializeScene(proposal));
}

const overlapScene = (): Scene => stageScene({
  types: {
    counter: { size: [3, 1, 1], front: "+v" },
    box: { size: [1, 1, 1] },
    stool: { size: [0.5, 0.5, 0.7] },
  },
  objects: [
    { id: "counter", type: "counter", pos: [0, 2] },
    { id: "box", type: "box", pos: [1.1, 0.6], locks: ["pos"] },
    { id: "stool", type: "stool", pos: [8, 2.25], locks: ["pos"] },
  ],
  relations: [{ id: "r1", rel: "facing", a: "counter", b: "stool", angle: 30, hard: true }],
});

const gridScene = (): Scene => stageScene({
  types: {
    small: { size: [1, 0.75, 1], front: "+v" },
    stool: { size: [0.5, 0.5, 0.7] },
  },
  objects: [
    { id: "small", type: "small", pos: [2, 2] },
    { id: "stool", type: "stool", pos: [8, 2.25], locks: ["pos"] },
  ],
  relations: [{ id: "r1", rel: "facing", a: "small", b: "stool", angle: 30, hard: true }],
});

const conflictScene = (): Scene => stageScene({
  types: { counter: { size: [3, 1, 1], front: "+v" } },
  objects: [{ id: "counter", type: "counter", pos: [2, 5] }],
  zones: [{ id: "slot", points: [[1, 4.9], [5, 4.9], [5, 6.1], [1, 6.1]] }],
  lanes: [{ id: "wall", width: 0.2, points: [[9, -20], [9, 40]] }],
  relations: [
    { id: "c1", rel: "inside", a: "counter", b: "zone:slot", hard: true },
    { id: "c2", rel: "facing", a: "counter", b: "lane:wall", angle: 30, hard: true },
    { id: "c3", rel: "clear_of", a: "counter", b: "lane:wall", min: 1, hard: true },
  ],
});

describe("solve --rotate: a turn is a move (SPEC 8)", () => {
  it("does not leave a turned footprint overlapping a box the input did not overlap", () => {
    const scene = overlapScene();
    const { report, proposal } = solveScene(scene, undefined, true);
    const counter = proposal.objects[0] as Scene["objects"][number];
    const box = proposal.objects[1] as Scene["objects"][number];
    expect(report.status).toBe("solved");
    expect(report.conflict).toEqual([]);
    expect(report.turned).toEqual([{ id: "counter", from: 0, to: 270 }]);
    expect(counter.rot).toBe(270);
    expect(counter.pos).toEqual([1, 1.6]);
    expect(report.distance).toBeCloseTo(0.6, 6);
    expect(rectsOverlap(footprint(proposal, counter), footprint(proposal, box))).toBe(false);
    expect(box.pos).toEqual([1.1, 0.6]);
    expectConstraints(scene, proposal);
    sameFile(scene);
  });

  it("keeps a coordinate the turn changes on the 0.05 grid", () => {
    const scene = gridScene();
    const { report, proposal } = solveScene(scene, undefined, true);
    const small = proposal.objects[0] as Scene["objects"][number];
    expect(report.status).toBe("solved");
    expect(small.rot).toBe(270);
    expect(small.pos).toEqual([2.15, 1.9]);
    expect(onGrid(small.pos[0] as number)).toBe(true);
    expect(onGrid(small.pos[1] as number)).toBe(true);
    expectConstraints(scene, proposal);
    sameFile(scene);
  });

  it("writes a move from the rot position when the snap lands on the input position", () => {
    const scene = stageScene({
      types: {
        small: { size: [1, 0.96, 1], front: "+v" },
        stool: { size: [0.5, 0.5, 0.7] },
      },
      objects: [
        { id: "small", type: "small", pos: [2, 2] },
        { id: "stool", type: "stool", pos: [8, 2.25], locks: ["pos"] },
      ],
      relations: [{ id: "r1", rel: "facing", a: "small", b: "stool", angle: 30, hard: true }],
    });
    const { report, proposal } = solveScene(scene, undefined, true);
    expect(report.status).toBe("solved");
    expect(report.turned).toEqual([{ id: "small", from: 0, to: 270 }]);
    expect(report.moved).toEqual([]);
    expect(proposal.objects[0]?.pos).toEqual([2, 2]);
    expect(solvePatch(scene, report)).toBe("# solve proposal\nrot small 270\nmove small u-0.02 v+0.02\n");
    sameFile(scene);
  });
});

describe("solve --rotate: the conflict set uses the rotating solver (SPEC 8)", () => {
  it("drops a relation that a turn satisfies, and keeps the set solve finds without --rotate", () => {
    const scene = conflictScene();
    const turned = solveScene(scene, undefined, true);
    const fixed = solveScene(scene, undefined, false);
    expect(turned.report.status).toBe("conflict");
    expect(turned.report.conflict).toEqual(["c1", "c2"]);
    expect(fixed.report.status).toBe("conflict");
    expect(fixed.report.conflict).toEqual(["c2"]);
    expect(fixed.report.turned).toBeUndefined();
    expect(fixed.proposal.objects[0]?.pos).toEqual([2, 5]);
    expect(fixed.proposal.objects[0]?.rot ?? 0).toBe(0);

    const only = (ids: readonly string[]) => {
      const relations = (scene.relations ?? []).filter((relation) => ids.includes(relation.id));
      return solveScene(validateScene({ ...scene, relations }), undefined, true).report;
    };
    expect(only(["c2"]).status).toBe("solved");
    expect(only(["c2"]).turned).toEqual([{ id: "counter", from: 0, to: 270 }]);
    expect(only(["c2", "c3"]).status).toBe("solved");
    expect(only(["c1", "c3"]).status).toBe("solved");
    expect(only(["c1", "c3"]).turned).toEqual([]);
  });

  it("gives the same conflict set on a second run, with and without --rotate", () => {
    const scene = conflictScene();
    const again = (rotate: boolean) => JSON.stringify(solveScene(scene, undefined, rotate).report);
    expect(again(true)).toBe(again(true));
    expect(again(false)).toBe(again(false));
  });
});
