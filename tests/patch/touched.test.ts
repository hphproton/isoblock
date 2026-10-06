import { describe, expect, it } from "vitest";
import { applyPatch } from "../../src/core/patch/apply";
import { parsePatch } from "../../src/core/patch/parse";
import { touchedLocks } from "../../src/core/patch/touched";
import type { Scene } from "../../src/core/types";
import { makeScene } from "../helpers/scene";

function scene(objects: Record<string, unknown>[], overrides: Record<string, unknown> = {}): Scene {
  return makeScene({ types: { box: { size: [1, 1, 1] }, other: { size: [2, 2, 2] } }, objects, ...overrides });
}

function touched(base: Scene, text: string): readonly string[] {
  return touchedLocks(base, applyPatch(base, parsePatch(text)));
}

const json = (ops: unknown[]) => JSON.stringify(ops);

describe("touchedLocks: pos, pos.u, pos.v", () => {
  const locked = (lock: string) => scene([{ id: "a", type: "box", pos: [1, 1], locks: [lock] }]);

  it("a pos lock is touched by a move on either axis", () => {
    expect(touched(locked("pos"), "move a u+1")).toEqual(["a.pos"]);
    expect(touched(locked("pos"), "move a v+1")).toEqual(["a.pos"]);
  });

  it("a pos.u lock blocks u only, a pos.v lock blocks v only", () => {
    expect(touched(locked("pos.u"), "move a u+1")).toEqual(["a.pos.u"]);
    expect(touched(locked("pos.u"), "move a v+1")).toEqual([]);
    expect(touched(locked("pos.v"), "move a v+1")).toEqual(["a.pos.v"]);
    expect(touched(locked("pos.v"), "move a u+1")).toEqual([]);
  });

  it("a move by zero changes no value and touches nothing", () => {
    expect(touched(locked("pos"), "move a u+0")).toEqual([]);
  });

  it("a JSON Patch on one coordinate is the same as a move", () => {
    expect(touched(locked("pos.u"), json([{ op: "replace", path: "/objects/0/pos/0", value: 5 }]))).toEqual(["a.pos.u"]);
    expect(touched(locked("pos.u"), json([{ op: "replace", path: "/objects/0/pos/1", value: 5 }]))).toEqual([]);
  });

  it("writing the same value again is not a change", () => {
    expect(touched(locked("pos"), json([{ op: "replace", path: "/objects/0/pos", value: [1, 1] }]))).toEqual([]);
  });
});

describe("touchedLocks: rot and type", () => {
  it("a rot lock is touched by a different rotation only", () => {
    const base = scene([{ id: "a", type: "box", pos: [1, 1], rot: 90, locks: ["rot"] }]);
    expect(touched(base, "rot a 180")).toEqual(["a.rot"]);
    expect(touched(base, "rot a 90")).toEqual([]);
  });

  it("an absent rot is 0: writing 0 is not a change", () => {
    const base = scene([{ id: "a", type: "box", pos: [1, 1], locks: ["rot"] }]);
    expect(touched(base, json([{ op: "add", path: "/objects/0/rot", value: 0 }]))).toEqual([]);
    expect(touched(base, json([{ op: "add", path: "/objects/0/rot", value: 90 }]))).toEqual(["a.rot"]);
  });

  it("a type lock is touched by a different type", () => {
    const base = scene([{ id: "a", type: "box", pos: [1, 1], locks: ["type"] }]);
    expect(touched(base, "set /objects/0/type other")).toEqual(["a.type"]);
    expect(touched(base, "set /objects/0/type box")).toEqual([]);
  });

  it("a rotation that moves pos touches the pos lock too, in lock order", () => {
    const base = scene([{ id: "a", type: "other", pos: [1, 1], locks: ["rot", "pos"] }], { types: { other: { size: [2, 1, 1] } } });
    expect(touched(base, "rot a 90")).toEqual(["a.rot", "a.pos"]);
  });
});

describe("touchedLocks: JSON Pointer locks", () => {
  const base = (): Scene => scene([{ id: "a", type: "box", pos: [1, 1], locks: ["/types/box/size/0"] }]);

  it("a change of the value at the pointer touches it, for every object that lists it", () => {
    expect(touched(base(), "set /types/box/size/0 3")).toEqual(["a./types/box/size/0"]);
    expect(touched(base(), "set /types/box/size/1 3")).toEqual([]);
  });

  it("counts the appearance and the removal of the value", () => {
    const s = scene([{ id: "a", type: "box", pos: [1, 1], locks: ["/types/box/x-note"] }]);
    expect(touched(s, json([{ op: "add", path: "/types/box/x-note", value: "n" }]))).toEqual(["a./types/box/x-note"]);
    const t = scene([{ id: "a", type: "box", pos: [1, 1], locks: ["/types/box/genHint"] }], { types: { box: { size: [1, 1, 1], genHint: "h" } } });
    expect(touched(t, json([{ op: "remove", path: "/types/box/genHint" }]))).toEqual(["a./types/box/genHint"]);
  });
});

describe("touchedLocks: lock entries and objects", () => {
  const base = () =>
    scene([
      { id: "a", type: "box", pos: [1, 1], locks: ["pos"] },
      { id: "b", type: "box", pos: [4, 1], locks: ["rot", "pos"] },
    ]);

  it("a lock entry that disappears is touched even though no value changed", () => {
    expect(touched(base(), json([{ op: "remove", path: "/objects/0/locks/0" }]))).toEqual(["a.pos"]);
    expect(touched(base(), json([{ op: "remove", path: "/objects/1/locks" }]))).toEqual(["b.rot", "b.pos"]);
  });

  it("a locked object that disappears touches all its locks", () => {
    expect(touched(base(), json([{ op: "remove", path: "/objects/1" }]))).toEqual(["b.rot", "b.pos"]);
  });

  it("an object that only moves in the list is still the same object", () => {
    expect(touched(base(), json([{ op: "move", from: "/objects/0", path: "/objects/1" }]))).toEqual([]);
  });

  it("only the locks of the original scene count", () => {
    const s = scene([{ id: "a", type: "box", pos: [1, 1] }]);
    expect(touched(s, "lock a pos\nmove a u+1")).toEqual([]);
  });

  it("lists labels in object order, then lock order", () => {
    expect(touched(base(), "move b u+1\nmove a u+1\nrot b 90")).toEqual(["a.pos", "b.rot", "b.pos"]);
  });

  it("touches nothing when only unlocked things change", () => {
    const s = scene([{ id: "a", type: "box", pos: [1, 1], locks: ["pos"] }, { id: "b", type: "box", pos: [4, 1] }]);
    expect(touched(s, "move b u+1\nset /types/other/size/0 3\nlock b rot")).toEqual([]);
  });

  it("copes with a result that is not a scene", () => {
    const s = base();
    expect(touchedLocks(s, null)).toEqual(["a.pos", "b.rot", "b.pos"]);
    expect(touchedLocks(s, { objects: 5 })).toEqual(["a.pos", "b.rot", "b.pos"]);
    expect(touchedLocks(s, { objects: [1, null, { id: 3 }] })).toEqual(["a.pos", "b.rot", "b.pos"]);
  });
});
