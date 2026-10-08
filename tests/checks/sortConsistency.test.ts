import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { runChecksInState } from "../../src/core/checks/inState";
import { checkSortConsistency } from "../../src/core/checks/sortConsistency";
import type { CheckResult, Scene, SortConsistencyCheck } from "../../src/core/types";
import { flatScene } from "../helpers/scene";

type Params = Partial<Omit<SortConsistencyCheck, "id" | "check">>;

/**
 * The flat camera of `flatScene` is orthographic: x = 10u and y = 10v - 10h, with c = (0, 1, 1), so
 * a sort key is v0 + v1 and the outline of a box is a rectangle. Areas below are worked out by hand.
 */
const types = {
  block: { size: [1, 1, 1] },
  // A square footprint at (0, 1) with an awning 2 above the ground that sticks out by 0.5 on both
  // sides along u and by 1 along v: world top box u -0.5..1.5, v 0..3, h 2..3.
  awning: {
    size: [1, 1, 3],
    parts: [
      { id: "base", box: [0, 0, 0, 1, 1, 1] },
      { id: "top", box: [-0.5, -1, 2, 1.5, 2, 3] },
    ],
  },
};

function scene(objects: Record<string, unknown>[], extra: Record<string, unknown> = {}): Scene {
  return flatScene({ types, objects, ...extra });
}

function sort(s: Scene, params: Params = {}): CheckResult {
  return checkSortConsistency(s, { actor: [1, 1, 1.5], step: 1, reach: 0, ...params, id: "sc", check: "sort_consistency" });
}

/** A zone far from every object: no actor position is inside it, so only static pairs are measured. */
const away = { zones: [{ id: "away", kind: "walkable", points: [[100, 100], [101, 100], [101, 101], [100, 101]] }] };

const awning = { id: "awning", type: "awning", pos: [0, 1] };

describe("sort_consistency: an actor next to an awning (worked out by hand)", () => {
  const r = sort(scene([awning]));

  it("uses the 8 positions that touch the footprint (reach 0, actor 1 x 1, step 1)", () => {
    expect(r.positions).toBe(8);
  });

  it("measures the largest area drawn in the wrong order: the awning over a side position, 5 px x 15 px", () => {
    // Side position: actor u -1..0, v 1..2, h 0..1.5 -> x -10..0, y -5..20; awning top x -5..15, y -30..10.
    // The keys are equal (3), so the actor is drawn after the awning but must be drawn before its top.
    expect(r.worst).toBe(75);
    expect([r.status, r.value, r.threshold, r.ids]).toEqual(["fail", 1, 0, ["awning"]]);
  });

  it("lists the result keys in the stable order", () => {
    expect(Object.keys(r)).toEqual(["id", "check", "status", "value", "threshold", "ids", "worst", "positions", "message"]);
  });

  it("passes when maxPixels reaches the worst area, and fails when it is smaller", () => {
    expect(sort(scene([awning]), { maxPixels: 75 }).status).toBe("pass");
    expect(sort(scene([awning]), { maxPixels: 74.5 }).status).toBe("fail");
    expect(sort(scene([awning]), { maxPixels: 75 }).value).toBe(0);
  });

  it("reports the worst area of an object that passes", () => {
    const passing = sort(scene([awning]), { maxPixels: 100 });
    expect([passing.status, passing.value, passing.ids, passing.worst]).toEqual(["pass", 0, [], 75]);
  });

  it("draws an actor in front of the awning wrong over 50 px x px when only that position is used", () => {
    // The only position in the zone: actor u 0..1, v 2..3 (centre 0.5, 2.5). The top is drawn too early.
    const zone = { zones: [{ id: "front", kind: "walkable", points: [[0.25, 2.25], [0.75, 2.25], [0.75, 2.75], [0.25, 2.75]] }] };
    const front = sort(scene([awning], zone), { area: "front" });
    expect([front.positions, front.worst]).toEqual([1, 50]);
  });

  it("draws an actor behind the awning correctly", () => {
    const zone = { zones: [{ id: "back", kind: "walkable", points: [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]] }] };
    const back = sort(scene([awning], zone), { area: "back" });
    expect([back.positions, back.worst, back.status]).toEqual([1, 0, "pass"]);
  });
});

describe("sort_consistency: pairs of objects", () => {
  it("measures the awning top over an object in front of it: 10 px x 5 px", () => {
    // z: u 0..1, v 2..3, h 0..1; its key 5 is above the awning's 3, so it is drawn after the whole awning.
    // It must be drawn before the top (it is lower): z outline y 10..30, top y -30..10 -> overlap 0 here,
    // so z is made taller: type "block" is 1 high, hence only the tall block below overlaps.
    const tall = { ...types, tall: { size: [1, 1, 1.5] } };
    const s = flatScene({ types: tall, objects: [awning, { id: "z", type: "tall", pos: [0, 2] }], ...away });
    const r = sort(s, { area: "away" });
    expect([r.positions, r.value, r.ids, r.worst]).toEqual([0, 2, ["awning", "z"], 50]);
  });

  it("lists both objects, only the examined one when ids is given", () => {
    const tall = { ...types, tall: { size: [1, 1, 1.5] } };
    const s = flatScene({ types: tall, objects: [awning, { id: "z", type: "tall", pos: [0, 2] }], ...away });
    expect(sort(s, { area: "away", ids: ["z"] }).ids).toEqual(["z"]);
    expect(sort(s, { area: "away", ids: ["awning"] }).ids).toEqual(["awning"]);
    expect(sort(s, { area: "away", ids: ["z"] }).value).toBe(1);
  });

  it("measures a block beside the awning whose top hangs over it: u 1..1.5 and v 1..2 overlap, 5 px x 10 px", () => {
    // The block is lower than the top, so it must be drawn first; its key 3 equals the awning's, and the awning comes first in the file.
    const s = scene([awning, { id: "side", type: "block", pos: [1, 1] }], away);
    expect(sort(s, { area: "away" }).worst).toBe(50);
  });

  it("skips pieces whose boxes intersect, in either file order", () => {
    // Two blocks overlap by 0.5 in u, v and h: neither can be drawn before the other.
    for (const objects of [["b", "c"], ["c", "b"]]) {
      const pos: Record<string, number[]> = { b: [0, 0], c: [0.5, 0.5] };
      const s = scene(objects.map((id) => ({ id, type: "block", pos: pos[id] })), away);
      expect(sort(s, { area: "away" }).worst, objects.join()).toBe(0);
    }
  });

  it("measures pieces whose boxes only touch: a block stacked on another", () => {
    const stack = { low: { size: [1, 1, 1] }, high: { size: [1, 1, 2], parts: [{ id: "upper", box: [0, 0, 1, 1, 1, 2] }] } };
    const s = flatScene({ types: stack, objects: [{ id: "h", type: "high", pos: [0, 0] }, { id: "l", type: "low", pos: [0, 0] }], ...away });
    // Same footprint, same key (1): the file order puts h before l, but l (below) must be drawn first.
    // l: y 10(0 - 1) .. 10(1 - 0) = -10..10; h: y 10(0 - 2) .. 10(1 - 1) = -20..0 -> overlap 10 px x 10 px.
    expect(sort(s, { area: "away" }).worst).toBe(100);
  });

  it("draws equal keys in the order of the sprite list", () => {
    // Both blocks have the footprint v 0.5..1.5, so the key is 2 for both; b sits on a, so a must be drawn first.
    const stack = { low: { size: [1, 1, 1] }, cap: { size: [1, 1, 1], parts: [{ id: "cap", box: [0, 0, 1, 1, 1, 2] }] } };
    const a = { id: "a", type: "low", pos: [0, 0.5] };
    const b = { id: "b", type: "cap", pos: [0, 0.5] };
    const right = flatScene({ types: stack, objects: [a, b], ...away });
    const wrong = flatScene({ types: stack, objects: [b, a], ...away });
    expect(sort(right, { area: "away" }).worst).toBe(0);
    // a: y 10(0.5 - 1) .. 10(1.5 - 0) = -5..15; b: y 10(0.5 - 2) .. 10(1.5 - 1) = -15..5 -> overlap 10 px x 10 px.
    expect(sort(wrong, { area: "away" }).worst).toBe(100);
  });

  it("cuts a footprint that is not square into slices, so that the keys of a stack on a long object differ", () => {
    // a is 1 x 2, so it has two slices with keys 1 and 3; the cap on it has key 2, between the slices: the second slice is wrong.
    const stack = { tall: { size: [1, 2, 1] }, cap: { size: [1, 1, 1], parts: [{ id: "cap", box: [0, 0, 1, 1, 1, 2] }] } };
    const s = flatScene({ types: stack, objects: [{ id: "a", type: "tall", pos: [0, 0] }, { id: "b", type: "cap", pos: [0, 0.5] }], ...away });
    // Second slice: v 1..2, h 0..1 -> y 0..20; cap: y -15..5 -> overlap 5 px x 10 px.
    const r = sort(s, { area: "away" });
    expect([r.worst, r.ids]).toEqual([50, ["a", "b"]]);
  });
});

describe("sort_consistency: positions", () => {
  const one = flatScene({ types, objects: [{ id: "b", type: "block", pos: [0, 0] }] });
  const params: Params = { actor: [0.5, 0.5, 1], step: 0.5 };

  it("counts the cells around a block that touch it (reach 0): the ring of 12", () => {
    expect(sort(one, { ...params, reach: 0 }).positions).toBe(12);
  });

  it("counts the cells within reach by their Euclidean gap: the corners of a ring 2 are too far", () => {
    expect(sort(one, { ...params, reach: 0.5 }).positions).toBe(28);
  });

  it("uses a step of 0.1 and a reach of 1 by default", () => {
    const explicit = sort(one, { actor: [0.4, 0.4, 1], step: 0.1, reach: 1 });
    const defaults = checkSortConsistency(one, { id: "sc", check: "sort_consistency", actor: [0.4, 0.4, 1] });
    expect(defaults).toEqual({ ...explicit, id: "sc" });
    expect(defaults.positions).toBeGreaterThan(500);
  });

  it("does not use a position where the actor overlaps any object, not only the examined one", () => {
    // c starts at u = 1.25: the two ring cells u 1..1.5 with v 0..0.5 and v 0.5..1 overlap it. At u = 1.5 it would only touch them.
    const near = flatScene({ types, objects: [{ id: "b", type: "block", pos: [0, 0] }, { id: "c", type: "block", pos: [1.25, 0] }] });
    expect(sort(near, { ...params, reach: 0, ids: ["b"] }).positions).toBe(10);
    const touching = flatScene({ types, objects: [{ id: "b", type: "block", pos: [0, 0] }, { id: "c", type: "block", pos: [1.5, 0] }] });
    expect(sort(touching, { ...params, reach: 0, ids: ["b"] }).positions).toBe(12);
  });

  it("counts positions once for each examined object", () => {
    const apart = flatScene({ types, objects: [{ id: "b", type: "block", pos: [0, 0] }, { id: "c", type: "block", pos: [10, 0] }] });
    const both = sort(apart, { ...params, reach: 0 });
    expect(both.positions).toBe(24);
    expect(sort(apart, { ...params, reach: 0, ids: ["c"] }).positions).toBe(12);
  });

  it("uses only positions inside the area, edges included", () => {
    const zone = { zones: [{ id: "z", kind: "walkable", points: [[-1, -1], [0, -1], [0, 3], [-1, 3]] }] };
    const s = flatScene({ types, objects: [{ id: "b", type: "block", pos: [0, 0] }], ...zone });
    // Centres on u = -0.25 (the cells left of the block): v from -0.75 to 1.75 -> 6 cells; u = 0.25 is outside.
    expect(sort(s, { ...params, reach: 0, area: "z" }).positions).toBe(4);
  });

  it("cuts blocked zones out of the area, and ignores them without an area", () => {
    const zones = {
      zones: [
        { id: "z", kind: "walkable", points: [[-3, -3], [3, -3], [3, 3], [-3, 3]] },
        { id: "pond", kind: "blocked", points: [[-1, -1], [-0.1, -1], [-0.1, 2], [-1, 2]] },
        { id: "dot", kind: "blocked", points: [[0, 0]] },
      ],
    };
    const s = flatScene({ types, objects: [{ id: "b", type: "block", pos: [0, 0] }], ...zones });
    const inside = sort(s, { ...params, reach: 0, area: "z" }).positions as number;
    const everywhere = sort(s, { ...params, reach: 0 }).positions as number;
    expect(everywhere).toBe(12);
    expect(inside).toBeLessThan(everywhere);
    // The pond covers the four ring cells at u = -0.25 (v = -0.25 .. 1.25); the single-point zone is ignored.
    expect(inside).toBe(8);
  });
});

describe("sort_consistency: skip", () => {
  const s = (zone: Record<string, unknown>) => scene([awning], { zones: [zone] });

  it("is skip, with no value, for an area with fewer than 3 points", () => {
    for (const points of [undefined, [], [[0, 0], [1, 1]]]) {
      const r = sort(s({ id: "mark", kind: "interaction", ...(points === undefined ? {} : { points }) }), { area: "mark" });
      expect([r.status, r.value, r.threshold, r.ids]).toEqual(["skip", null, null, []]);
      expect(r.message).toMatch(/needs 3 or more/);
    }
  });

  it("is skip when the search around an examined object has more than 4,000,000 cells", () => {
    const r = sort(scene([awning]), { step: 0.0001, reach: 1 });
    expect([r.status, r.value, r.ids]).toEqual(["skip", null, []]);
    expect(r.message).toMatch(/larger step/);
  });

  it("measures the cells by the examined objects only", () => {
    const big = { ...types, field: { size: [2000, 1, 1] } };
    const world = flatScene({ types: big, objects: [awning, { id: "f", type: "field", pos: [10, 10] }] });
    // The field: (2000 + 2 * 0.5 + 1) * (1 + 2 * 0.5 + 1) / 0.02^2 = 15,015,000 cells.
    expect(sort(world, { step: 0.02, reach: 0.5, ids: ["f"] }).status).toBe("skip");
    expect(sort(world, { step: 0.02, reach: 0.5, ids: ["awning"] }).status).not.toBe("skip");
  });

  it("skips above 4,000,000 cells and runs at exactly 4,000,000", () => {
    // (L + 2 * 0 + 2) * (L + 0 + 2) / 1 with an actor of 2 x 2: 1998 gives 2000 * 2000.
    const sized = (side: number) => flatScene({ types: { sq: { size: [side, side, 1] } }, objects: [{ id: "q", type: "sq", pos: [0, 0] }] });
    expect(sort(sized(1998), { actor: [2, 2, 1], step: 1, reach: 0 }).status).not.toBe("skip");
    expect(sort(sized(1999), { actor: [2, 2, 1], step: 1, reach: 0 }).status).toBe("skip");
  });
});

describe("sort_consistency: states (SPEC 9.2, 9.3)", () => {
  const objects = [awning, { id: "z", type: "block", pos: [0, 2] }];
  const states = { states: { clear: { hide: ["z"] }, empty: { hide: ["awning", "z"] } } };
  const withCheck = (check: Record<string, unknown>): Scene =>
    flatScene({ types, objects, ...states, checks: [{ id: "sc", check: "sort_consistency", actor: [1, 1, 1.5], step: 1, reach: 0, ...check }] });

  it("gives a hidden object no sprites, no blocking and no examination", () => {
    // The cell in front of the awning belongs to z, so the awning has 7 positions; z has 7 as well (the cell behind it is the awning).
    expect((runChecks(withCheck({}))[0] as CheckResult).positions).toBe(14);
    const alone = { ids: ["awning"] };
    expect((runChecks(withCheck(alone))[0] as CheckResult).positions).toBe(7);
    // Hiding z frees that cell and leaves only the awning to examine.
    const clear = runChecksInState(withCheck({}), "clear")[0] as CheckResult;
    expect(clear.positions).toBe(8);
    expect(clear.ids).toEqual(["awning"]);
  });

  it("loses a hidden object from ids: a list that loses them all examines nothing", () => {
    const r = runChecksInState(withCheck({ ids: ["z"] }), "clear")[0] as CheckResult;
    expect([r.status, r.value, r.ids, r.worst, r.positions]).toEqual(["pass", 0, [], 0, 0]);
  });

  it("examines nothing when every object is hidden", () => {
    const r = runChecksInState(withCheck({}), "empty")[0] as CheckResult;
    expect([r.status, r.value, r.worst, r.positions]).toEqual(["pass", 0, 0, 0]);
  });
});
