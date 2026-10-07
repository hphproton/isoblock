import { describe, expect, it } from "vitest";
import { checkReachable } from "../../src/core/checks/reachable";
import { runChecks } from "../../src/core/checks";
import { MAX_CELLS } from "../../src/core/checks/walkGrid";
import type { CheckResult, ReachableCheck, Scene } from "../../src/core/types";
import { expectMatchesExpected } from "../helpers/fixtures";
import { makeScene } from "../helpers/scene";
import { loadWalk, loadWalkExpected } from "../helpers/states";

type Params = Omit<ReachableCheck, "id" | "check">;

const rect = (u0: number, v0: number, u1: number, v1: number) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

/** A walkable lawn of 4 x 2 units and, by default, nothing else. */
function lawn(overrides: Record<string, unknown> = {}): Scene {
  return makeScene({
    zones: [{ id: "lawn", kind: "walkable", points: rect(0, 0, 4, 2) }],
    ...overrides,
  });
}

function reach(scene: Scene, params: Params): CheckResult {
  return checkReachable(scene, { id: "r", check: "reachable", ...params });
}

describe("reachable: the walk fixture", () => {
  it("gives the reachable rows of walk.expected.json", () => {
    expectMatchesExpected(runChecks(loadWalk()), loadWalkExpected(), ["reachable"]);
  });
});

describe("reachable: grid, start and target", () => {
  it("counts moves between free cells and multiplies them by step", () => {
    const r = reach(lawn(), { from: [0.05, 0.05], to: [3.95, 1.95] });
    expect([r.status, r.value, r.threshold, r.ids]).toEqual(["pass", 5.8, null, []]);
  });

  it("uses the step given, with the grid centers at (i + 0.5) * step", () => {
    const r = reach(lawn(), { from: [0.25, 0.25], to: [3.75, 1.75], step: 0.5 });
    expect(r.value).toBe(5);
  });

  it("takes the nearest free cell as start and target; a tie goes to the smaller i, then the smaller j", () => {
    const scene = lawn({ zones: [{ id: "lawn", kind: "walkable", points: rect(0, 0, 2, 1) }] });
    // [0.5, 0.5] is equally near the centers of cells (0,0), (1,0), (0,1) and (1,1): (0,0) wins, so 3 + 1 moves.
    const r = reach(scene, { from: [0.5, 0.5], to: [1.75, 0.75], step: 0.5 });
    expect(r.value).toBe(2);
  });

  it("fails when the nearest free cell is farther than step, but not at exactly step", () => {
    const scene = lawn({ zones: [{ id: "lawn", kind: "walkable", points: rect(0, 0, 2, 1) }] });
    const at = (u: number) => reach(scene, { from: [u, 0.25], to: [1.75, 0.75], step: 0.5 });
    expect(at(-0.25).status).toBe("pass");
    const far = at(-0.26);
    expect([far.status, far.value, far.message]).toEqual(["fail", null, "start is not on walkable ground"]);
    const target = reach(scene, { from: [0.25, 0.25], to: [9, 9], step: 0.5 });
    expect([target.status, target.value, target.message]).toEqual(["fail", null, "target is not on walkable ground"]);
  });

  it("reports an unreachable start before an unreachable target", () => {
    expect(reach(lawn(), { from: [-5, -5], to: [9, 9] }).message).toBe("start is not on walkable ground");
  });

  it("counts a cell center on the boundary of the walkable area as inside", () => {
    const scene = lawn({ zones: [{ id: "lawn", kind: "walkable", points: rect(1, 1, 3, 3) }] });
    const r = reach(scene, { from: [1, 1], to: [3, 3], step: 2 });
    expect([r.status, r.value]).toEqual(["pass", 4]);
  });

  it("is a path of 0 when start and target are the same cell", () => {
    // Both points fall on cell (9, 9), whose center is (0.95, 0.95): the first by the tie rule, the second as the nearest.
    expect(reach(lawn(), { from: [1, 1], to: [0.97, 0.97] }).value).toBe(0);
  });
});

describe("reachable: what blocks a cell", () => {
  const wall = [[1.9, 0], [2.1, 0], [2.1, 1.5], [1.9, 1.5]];

  it("does not enter a zone with kind blocked, so the path goes around it", () => {
    const params: Params = { from: [0.55, 0.55], to: [3.45, 0.55] };
    const straight = reach(lawn(), params);
    const around = reach(lawn({ zones: [...lawn().zones!, { id: "wall", kind: "blocked", points: wall }] }), params);
    expect(straight.value).toBe(2.9);
    // Up from v = 0.55 to the first row above the wall (center 1.55), across, and down again: 10 + 29 + 10 moves.
    expect([around.status, around.value]).toEqual(["pass", 4.9]);
  });

  it("fails with no walkable path when a blocked zone closes the lawn", () => {
    const closed = lawn({ zones: [...lawn().zones!, { id: "wall", kind: "blocked", points: rect(1.9, -1, 2.1, 3) }] });
    const r = reach(closed, { from: [0.55, 0.55], to: [3.45, 0.55] });
    expect([r.status, r.value, r.message]).toEqual(["fail", null, "no walkable path"]);
  });

  const types = { box: { size: [1, 1, 1] }, slab: { size: [1, 1.7, 1], anchors: [{ id: "top", at: [0.5, 0.2, 0], kind: "mark" }] } };
  // The slab covers v from 0 to 1.7 and leaves a strip 0.3 wide against the upper edge of the lawn.
  const blocked = (extra: Record<string, unknown> = {}) =>
    lawn({ types, objects: [{ id: "s", type: "slab", pos: [1.5, 0] }, { id: "b", type: "box", pos: [3, 0] }], ...extra });
  const across: Params = { from: [0.55, 1.95], to: [3.55, 1.95] };

  it("keeps cells at a distance of at least radius from the footprints (radius 0.2 by default)", () => {
    expect(reach(blocked(), across).status).toBe("pass");
    const wide = reach(blocked(), { ...across, radius: 0.3 });
    expect([wide.status, wide.message]).toEqual(["fail", "no walkable path"]);
    expect(reach(blocked(), { ...across, radius: 0 }).status).toBe("pass");
  });

  it("lets objects in ignore through", () => {
    expect(reach(blocked(), { ...across, radius: 0.3, ignore: ["s"] }).status).toBe("pass");
  });

  it("does not treat the objects whose anchors the points name as obstacles", () => {
    const toAnchor = reach(blocked(), { from: [0.55, 1.95], to: "anchor:s/top", radius: 0.3 });
    expect(toAnchor.status).toBe("pass");
    expect(toAnchor.ids).toEqual(["s"]);
  });
});

describe("reachable: max, area and the points", () => {
  it("passes at exactly max and fails above it, still reporting the value", () => {
    const params: Params = { from: [0.05, 0.05], to: [3.05, 0.05] };
    expect(reach(lawn(), { ...params, max: 3 })).toMatchObject({ status: "pass", value: 3, threshold: 3 });
    expect(reach(lawn(), { ...params, max: 2.9 })).toMatchObject({ status: "fail", value: 3, threshold: 2.9 });
  });

  it("is skip without a walkable zone, and for an area with fewer than 3 points", () => {
    const none = reach(makeScene({}), { from: [0, 0], to: [1, 1] });
    expect([none.status, none.value, none.threshold, none.ids]).toEqual(["skip", null, null, []]);
    expect(none.message).toMatch(/walkable/);
    const bare = lawn({ zones: [{ id: "z", kind: "walkable" }] });
    expect(reach(bare, { from: [0, 0], to: [1, 1] }).status).toBe("skip");
    expect(reach(lawn({ zones: [...lawn().zones!, { id: "z" }] }), { from: [0, 0], to: [1, 1], area: "z" }).status).toBe("skip");
  });

  it("uses only the polygon of area when it is given, whatever its kind", () => {
    const two = lawn({
      zones: [
        { id: "left", kind: "walkable", points: rect(0, 0, 1, 1) },
        { id: "right", kind: "walkable", points: rect(3, 0, 4, 1) },
        { id: "free", points: rect(0, 0, 4, 1) },
      ],
    });
    const params: Params = { from: [0.55, 0.55], to: [3.45, 0.55] };
    expect(reach(two, params).message).toBe("no walkable path");
    expect(reach(two, { ...params, area: "free" }).status).toBe("pass");
    expect(reach(two, { from: [0.55, 0.55], to: [0.85, 0.55], area: "left" }).status).toBe("pass");
    expect(reach(two, { from: [0.55, 0.55], to: [3.45, 0.55], area: "left" }).message).toBe("target is not on walkable ground");
  });

  it("takes the first point of a lane for from and its last point for to", () => {
    const scene = lawn({ lanes: [{ id: "L", width: 0.5, points: [[0.05, 0.05], [3.05, 0.05]] }] });
    expect(reach(scene, { from: "lane:L", to: [0.05, 0.05] }).value).toBe(0);
    expect(reach(scene, { from: [0.05, 0.05], to: "lane:L" }).value).toBe(3);
    expect(reach(scene, { from: "lane:L", to: "lane:L" }).value).toBe(3);
  });

  it("takes the ground point of an anchor after rotation, and names its object", () => {
    const types = { bench: { size: [2, 1, 1], anchors: [{ id: "a", at: [0.25, 0.5, 0.4], kind: "seat" }] } };
    const scene = lawn({ types, objects: [{ id: "b", type: "bench", pos: [1, 0.5], rot: 90 }] });
    // rot 90 maps the anchor (0.25, 0.5) to (1 + 1 - 0.5, 0.5 + 0.25) = (1.5, 0.75).
    const byAnchor = reach(scene, { from: [0.05, 0.05], to: "anchor:b/a" });
    const byPoint = reach(scene, { from: [0.05, 0.05], to: [1.5, 0.75], ignore: ["b"] });
    expect(byAnchor.status).toBe("pass");
    expect(byAnchor.value).toBe(byPoint.value);
    expect(byAnchor.ids).toEqual(["b"]);
  });

  it("names each object once, in the order of the objects", () => {
    const types = { post: { size: [0.2, 0.2, 1], anchors: [{ id: "a", at: [0.1, 0.1, 0], kind: "mark" }] } };
    const scene = lawn({ types, objects: [{ id: "p", type: "post", pos: [1, 1] }, { id: "q", type: "post", pos: [3, 1] }] });
    expect(reach(scene, { from: "anchor:q/a", to: "anchor:p/a" }).ids).toEqual(["p", "q"]);
    expect(reach(scene, { from: "anchor:p/a", to: "anchor:p/a" }).ids).toEqual(["p"]);
  });

  it("is skip, not a hang, when the grid would be larger than the limit", () => {
    const huge = lawn({ zones: [{ id: "z", kind: "walkable", points: rect(0, 0, 4000, 4000) }] });
    const r = reach(huge, { from: [1, 1], to: [2, 2] });
    expect(r.status).toBe("skip");
    expect(r.message).toContain(String(MAX_CELLS));
  });
});
