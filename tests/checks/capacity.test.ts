import { describe, expect, it } from "vitest";
import { checkCapacity } from "../../src/core/checks/capacity";
import { runChecks } from "../../src/core/checks";
import type { CapacityCheck, CheckResult, Scene } from "../../src/core/types";
import { expectMatchesExpected } from "../helpers/fixtures";
import { makeScene } from "../helpers/scene";
import { loadWalk, loadWalkExpected } from "../helpers/states";

type Params = Partial<Omit<CapacityCheck, "id" | "check">>;

const types = {
  // Two seats 1 apart on the long side.
  bench: {
    size: [2, 0.5, 0.5],
    anchors: [
      { id: "s1", at: [0.5, 0.25, 0.5], kind: "seat" },
      { id: "s2", at: [1.5, 0.25, 0.5], kind: "seat" },
      { id: "door", at: [1, 0.25, 0], kind: "entry" },
    ],
  },
  crate: { size: [1, 1, 1] },
};

function scene(objects: Record<string, unknown>[]): Scene {
  return makeScene({ types, objects });
}

function capacity(s: Scene, params: Params): CheckResult {
  return checkCapacity(s, { kind: "seat", min: 1, ...params, id: "cap", check: "capacity" });
}

describe("capacity: the walk fixture", () => {
  it("gives the capacity rows of walk.expected.json", () => {
    expectMatchesExpected(runChecks(loadWalk()), loadWalkExpected(), ["capacity"]);
  });
});

describe("capacity: candidates and bodies", () => {
  const one = scene([{ id: "b", type: "bench", pos: [0, 0] }]);

  it("counts the anchors of the kind, with a body of 0.5 x 0.5 by default", () => {
    const r = capacity(one, { min: 2 });
    expect([r.status, r.value, r.threshold, r.ids, r.accepted, r.rejected]).toEqual(["pass", 2, 2, ["b"], ["b/s1", "b/s2"], []]);
  });

  it("rejects a candidate whose body overlaps a body accepted before, in anchor order", () => {
    const r = capacity(one, { body: [1.2, 0.5], min: 2 });
    expect([r.status, r.value, r.accepted, r.rejected]).toEqual(["fail", 1, ["b/s1"], ["b/s2"]]);
  });

  it("lets bodies touch: an overlap needs more than EPS along both axes", () => {
    expect(capacity(one, { body: [1, 0.5], min: 2 }).value).toBe(2);
  });

  it("does not let a rejected candidate block the next one", () => {
    const seats = { row: { size: [2, 1, 1], anchors: [0.2, 0.6, 1.0].map((u, i) => ({ id: `s${i}`, at: [u, 0.5, 0], kind: "seat" })) } };
    const s = makeScene({ types: seats, objects: [{ id: "r", type: "row", pos: [0, 0] }] });
    const r = capacity(s, { body: [0.5, 0.5], min: 2 });
    expect([r.accepted, r.rejected]).toEqual([["r/s0", "r/s2"], ["r/s1"]]);
  });

  it("is 0 for a kind nobody has, and then passes only with min 0", () => {
    const r = capacity(one, { kind: "bed", min: 0 });
    expect([r.status, r.value, r.ids, r.accepted, r.rejected]).toEqual(["pass", 0, [], [], []]);
    expect(capacity(one, { kind: "bed", min: 1 }).status).toBe("fail");
  });

  it("rotates the anchors with their object", () => {
    // Turned by 90 degrees, the seats are at (0.25, 0.5) and (0.25, 1.5); a crate on the second one rejects it.
    const turned = scene([{ id: "b", type: "bench", pos: [0, 0], rot: 90 }, { id: "c", type: "crate", pos: [0, 1.2] }]);
    expect(capacity(turned, {}).rejected).toEqual(["b/s2"]);
    const flat = scene([{ id: "b", type: "bench", pos: [0, 0] }, { id: "c", type: "crate", pos: [0, 1.2] }]);
    expect(capacity(flat, {}).rejected).toEqual([]);
  });
});

describe("capacity: what blocks a body", () => {
  const near = [{ id: "b", type: "bench", pos: [0, 0] }, { id: "c", type: "crate", pos: [1.3, 0] }];

  it("is blocked by the footprint of any other object, but not by the footprint of its own", () => {
    const r = capacity(scene(near), {});
    expect([r.accepted, r.rejected]).toEqual([["b/s1"], ["b/s2"]]);
  });

  it("lets objects in allow overlap a body", () => {
    expect(capacity(scene(near), { allow: ["c"] }).rejected).toEqual([]);
  });

  it("limits the candidates to ids, but every other object still blocks", () => {
    const r = capacity(scene([...near, { id: "d", type: "bench", pos: [5, 5] }]), { ids: ["d", "b"] });
    expect(r.ids).toEqual(["b", "d"]);
    expect(r.accepted).toEqual(["b/s1", "d/s1", "d/s2"]);
    expect(r.rejected).toEqual(["b/s2"]);
  });

  it("lists the objects with a candidate in the order of the objects, also when all are rejected", () => {
    const s = scene([{ id: "z", type: "bench", pos: [0, 0] }, { id: "a", type: "bench", pos: [0.2, 0.2] }]);
    const r = capacity(s, {});
    expect(r.ids).toEqual(["z", "a"]);
    expect([r.value, r.accepted, r.rejected]).toEqual([0, [], ["z/s1", "z/s2", "a/s1", "a/s2"]]);
  });
});
