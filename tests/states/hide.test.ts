import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { runChecksInState } from "../../src/core/checks/inState";
import { IsoblockError } from "../../src/core/errors";
import { hiddenIn, sceneInState, withoutObjects } from "../../src/core/states";
import type { CheckResult, Scene } from "../../src/core/types";
import { flatScene } from "../helpers/scene";
import { loadWalk } from "../helpers/states";

const types = {
  box: { size: [1, 1, 1] },
  tall: { size: [1, 1, 3] },
  bench: { size: [2, 1, 0.5], anchors: [{ id: "seat", at: [1, 0.5, 0.5], kind: "seat" }] },
};

/** Objects a, b and c; b covers a; "cover" hides b, "all" hides everything, "none" hides nothing. */
function scene(checks: Record<string, unknown>[], extra: Record<string, unknown> = {}): Scene {
  return flatScene({
    types,
    objects: [
      { id: "a", type: "box", pos: [2, 2] },
      { id: "b", type: "box", pos: [2.5, 2.5] },
      { id: "c", type: "box", pos: [6, 6] },
    ],
    checks,
    states: { cover: { hide: ["b"] }, all: { hide: ["a", "b", "c"] }, none: { hide: [] } },
    ...extra,
  });
}

function one(s: Scene, state: string | undefined): CheckResult {
  return (state === undefined ? runChecks(s) : runChecksInState(s, state))[0] as CheckResult;
}

describe("states: hiding objects", () => {
  it("names the objects a state hides, and refuses an unknown name with E_USAGE", () => {
    const s = scene([]);
    expect([...hiddenIn(s, "cover")]).toEqual(["b"]);
    expect(() => hiddenIn(s, "night")).toThrowError(expect.objectContaining({ code: "E_USAGE", message: "unknown state 'night'" }));
    try {
      hiddenIn(s, "night");
    } catch (e) {
      expect((e as IsoblockError).details).toEqual(["The scene defines: cover, all, none."]);
    }
    expect(() => hiddenIn(flatScene({}), "night")).toThrowError(/unknown state/);
    expect(() => hiddenIn(flatScene({ states: {} }), "toString")).toThrowError(/unknown state/);
  });

  it("gives the scene without the hidden objects and leaves the scene itself alone", () => {
    const s = scene([]);
    expect(sceneInState(s, "cover").objects.map((o) => o.id)).toEqual(["a", "c"]);
    expect(s.objects).toHaveLength(3);
    expect(sceneInState(s, undefined)).toBe(s);
    expect(withoutObjects(s, new Set())).toBe(s);
  });

  it("gives the same results as no state when the state hides nothing", () => {
    const s = scene([{ id: "x", check: "no_overlap" }, { id: "y", check: "clearance", a: "a", b: "c", min: 1 }]);
    expect(runChecksInState(s, "none")).toEqual(runChecks(s));
  });

  it("keeps one result per check, in the order of the checks", () => {
    const s = scene([{ id: "x", check: "no_overlap" }, { id: "y", check: "visible", target: "b", maxOccluded: 0 }, { id: "z", check: "clearance", a: "a", b: "c", min: 1 }]);
    expect(runChecksInState(s, "cover").map((r) => [r.id, r.status])).toEqual([["x", "pass"], ["y", "skip"], ["z", "pass"]]);
  });
});

describe("states: a check that names a hidden object by itself is skip", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["clearance a", { check: "clearance", a: "b", b: "c", min: 1 }],
    ["clearance b", { check: "clearance", a: "a", b: "b", min: 1 }],
    ["visible target", { check: "visible", target: "b", maxOccluded: 0 }],
    ["min_screen_size target", { check: "min_screen_size", target: "b", min: 1 }],
    ["reachable from", { check: "reachable", from: "anchor:s/seat", to: [1, 1] }],
    ["reachable to", { check: "reachable", from: [1, 1], to: "anchor:s/seat" }],
  ];

  for (const [name, spec] of cases) {
    it(`${name}: skip, with no value, no threshold and no ids`, () => {
      const s = scene([{ id: "x", ...spec }], {
        objects: [{ id: "b", type: "box", pos: [0, 0] }, { id: "c", type: "box", pos: [5, 5] }, { id: "a", type: "box", pos: [8, 8] }, { id: "s", type: "bench", pos: [3, 3] }],
        zones: [{ id: "lawn", kind: "walkable", points: [[0, 0], [10, 0], [10, 10], [0, 10]] }],
        states: { cover: { hide: ["b", "s"] } },
      });
      const r = one(s, "cover");
      expect([r.status, r.value, r.threshold, r.ids]).toEqual(["skip", null, null, []]);
      expect(r.message).toMatch(/hidden in state "cover"/);
    });
  }

  it("the same checks are not skipped without a state", () => {
    const s = scene([{ id: "x", check: "clearance", a: "a", b: "b", min: 0 }]);
    expect(one(s, undefined).status).toBe("pass");
  });
});

describe("states: hidden objects count nowhere", () => {
  it("do not overlap", () => {
    const s = scene([{ id: "x", check: "no_overlap" }]);
    expect(one(s, undefined)).toMatchObject({ status: "fail", value: 1, ids: ["a", "b"] });
    expect(one(s, "cover")).toMatchObject({ status: "pass", value: 0, ids: [], pairs: [] });
  });

  it("do not occlude", () => {
    const s = scene([{ id: "x", check: "visible", target: "a", maxOccluded: 0 }], {
      objects: [{ id: "a", type: "box", pos: [2, 2] }, { id: "b", type: "tall", pos: [2, 3] }],
    });
    // The camera direction is (0, 1, 1): b stands in front of a (larger v) and is taller.
    expect(one(s, undefined)).toMatchObject({ status: "fail", occluders: ["b"] });
    expect(one(s, "cover")).toMatchObject({ status: "pass", value: 0, occluders: [] });
  });

  it("do not block a lane", () => {
    const s = scene([{ id: "x", check: "lane_clear", lane: "L" }], {
      lanes: [{ id: "L", width: 1, points: [[0, 2.5], [9, 2.5]] }],
      objects: [{ id: "b", type: "box", pos: [4, 2] }],
    });
    expect(one(s, undefined)).toMatchObject({ status: "fail", ids: ["b"] });
    expect(one(s, "cover")).toMatchObject({ status: "pass", ids: [] });
  });

  it("are not checked by in_region when ids is absent", () => {
    const s = scene([{ id: "x", check: "in_region", region: "view" }], {
      objects: [{ id: "a", type: "box", pos: [2, 2] }, { id: "b", type: "box", pos: [500, 500] }],
    });
    expect(one(s, undefined)).toMatchObject({ status: "fail", ids: ["b"] });
    expect(one(s, "cover")).toMatchObject({ status: "pass", ids: [] });
  });

  it("do not block a path, a cell or a seat", () => {
    const lawn = { id: "lawn", kind: "walkable", points: [[0, 0], [6, 0], [6, 2], [0, 2]] };
    const wall = { id: "w", type: "wall", pos: [3, 0] };
    const walls = { ...types, wall: { size: [0.4, 2, 1] } };
    const s = scene([{ id: "x", check: "reachable", from: [0.55, 1], to: [5.45, 1] }], { types: walls, zones: [lawn], objects: [wall], states: { open: { hide: ["w"] } } });
    expect(one(s, undefined)).toMatchObject({ status: "fail", message: "no walkable path" });
    expect(one(s, "open")).toMatchObject({ status: "pass", value: 4.9 });
    const seats = scene([{ id: "x", check: "capacity", kind: "seat", min: 1 }], {
      objects: [{ id: "s", type: "bench", pos: [0, 0] }, { id: "b", type: "box", pos: [0.6, 0] }],
    });
    expect(one(seats, undefined)).toMatchObject({ status: "fail", value: 0, rejected: ["s/seat"] });
    expect(one(seats, "cover")).toMatchObject({ status: "pass", value: 1, accepted: ["s/seat"] });
  });
});

describe("states: lists lose the hidden objects", () => {
  it("ids, allow and ignore: a list that loses all its objects checks none, not all", () => {
    const only = scene([{ id: "x", check: "no_overlap", ids: ["a", "b"] }]);
    expect(one(only, undefined)).toMatchObject({ status: "fail", value: 1 });
    expect(one(only, "cover")).toMatchObject({ status: "pass", value: 0 });
    const gone = scene([{ id: "x", check: "in_region", region: "view", ids: ["b"] }], {
      objects: [{ id: "a", type: "box", pos: [500, 500] }, { id: "b", type: "box", pos: [2, 2] }],
    });
    expect(one(gone, "cover")).toMatchObject({ status: "pass", value: 0, ids: [] });
    const capacity = scene([{ id: "x", check: "capacity", kind: "seat", min: 0, ids: ["b"] }]);
    expect(one(capacity, "cover")).toMatchObject({ status: "pass", value: 0, ids: [] });
  });

  it("allow pairs of no_overlap that name a hidden object are dropped", () => {
    const s = scene([{ id: "x", check: "no_overlap", allow: [["a", "b"]] }]);
    expect(one(s, undefined)).toMatchObject({ status: "pass" });
    expect(one(s, "cover")).toMatchObject({ status: "pass", pairs: [] });
  });

  it("allow of capacity and ignore of lane_clear and reachable lose hidden objects", () => {
    const s = scene([{ id: "x", check: "capacity", kind: "seat", min: 1, allow: ["b", "a"] }], {
      objects: [{ id: "s", type: "bench", pos: [0, 0] }, { id: "a", type: "box", pos: [0.6, 0] }, { id: "b", type: "box", pos: [0.6, 0] }],
      states: { cover: { hide: ["b"] } },
    });
    expect(one(s, "cover")).toMatchObject({ status: "pass", value: 1 });
    const lane = scene([{ id: "x", check: "lane_clear", lane: "L", ignore: ["b"] }], {
      lanes: [{ id: "L", width: 1, points: [[0, 2.5], [9, 2.5]] }],
      objects: [{ id: "a", type: "box", pos: [4, 2] }, { id: "b", type: "box", pos: [6, 2] }],
    });
    expect(one(lane, undefined)).toMatchObject({ status: "fail", ids: ["a"] });
    expect(one(lane, "cover")).toMatchObject({ status: "fail", ids: ["a"] });
  });
});

describe("states: the walk scene", () => {
  it("rejects a state the scene does not define", () => {
    expect(() => runChecksInState(loadWalk(), "night")).toThrowError(/unknown state 'night'/);
  });

  it("changes nothing for the checks that do not involve the hidden objects", () => {
    const base = runChecks(loadWalk());
    const open = runChecksInState(loadWalk(), "open");
    const same = (id: string) => open.find((r) => r.id === id);
    for (const id of ["k1", "k3", "k4", "s1", "s3", "s4", "m1", "o1"]) expect(same(id), id).toEqual(base.find((r) => r.id === id));
    expect(same("k2")).toMatchObject({ status: "pass" });
    expect(base.find((r) => r.id === "k2")).toMatchObject({ status: "fail" });
  });
});
