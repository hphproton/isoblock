import { describe, expect, it } from "vitest";
import { moveObject, setObjectType, setRotation, setTypeSize } from "../../src/core/edit";
import { IsoblockError } from "../../src/core/errors";
import { box, makeScene } from "../helpers/scene";
import { loadScene } from "../helpers/fixtures";

const scene = makeScene({
  types: { box: { size: [1, 1, 1] }, tall: { size: [1, 1, 3] } },
  objects: [
    { ...box("free", [0, 0]) },
    { ...box("fixed", [2, 0]), locks: ["pos"] },
    { ...box("noU", [4, 0]), locks: ["pos.u"] },
    { ...box("noV", [6, 0]), locks: ["pos.v"] },
    { ...box("turn", [8, 0], "box", 90), locks: ["rot", "type"] },
    { ...box("sized", [10, 0]), locks: ["/types/tall/size/2"] },
  ],
  assumptions: [
    { path: "/objects/0/pos/0", value: 0, note: "guess" },
    { path: "/types/tall/size/2", value: 3, note: "guess" },
    { path: "/types/box/size/0", value: 1 },
  ],
});

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof IsoblockError ? e.code : "other";
  }
  return undefined;
}

describe("moveObject", () => {
  it("moves a free object and shares every other object with the input", () => {
    const { scene: next, blocked } = moveObject(scene, "free", [1.5, 2]);
    expect(blocked).toEqual([]);
    expect(next.objects[0]!.pos).toEqual([1.5, 2]);
    expect(scene.objects[0]!.pos).toEqual([0, 0]);
    expect(next.objects[1]).toBe(scene.objects[1]);
    expect(next.types).toBe(scene.types);
  });

  it("returns the same scene when the position does not change", () => {
    expect(moveObject(scene, "free", [0, 0]).scene).toBe(scene);
  });

  it("refuses to move an object whose pos is locked", () => {
    const result = moveObject(scene, "fixed", [5, 5]);
    expect(result.scene).toBe(scene);
    expect(result.blocked).toEqual(["pos"]);
  });

  it("blocks only the u axis for pos.u", () => {
    const result = moveObject(scene, "noU", [9, 3]);
    expect(result.scene.objects[2]!.pos).toEqual([4, 3]);
    expect(result.blocked).toEqual(["pos.u"]);
  });

  it("blocks only the v axis for pos.v", () => {
    const result = moveObject(scene, "noV", [7, 3]);
    expect(result.scene.objects[3]!.pos).toEqual([7, 0]);
    expect(result.blocked).toEqual(["pos.v"]);
  });

  it("does not report a lock when the locked axis keeps its value", () => {
    const result = moveObject(scene, "noU", [4, 3]);
    expect(result.blocked).toEqual([]);
    expect(result.scene.objects[2]!.pos).toEqual([4, 3]);
  });

  it("keeps the assumption value in step with an edited number", () => {
    const next = moveObject(scene, "free", [2.5, 0]).scene;
    expect(next.assumptions![0]).toEqual({ path: "/objects/0/pos/0", value: 2.5, note: "guess" });
    expect(next.assumptions![1]).toBe(scene.assumptions![1]);
  });

  it("rejects coordinates that are not finite numbers", () => {
    expect(code(() => moveObject(scene, "free", [Number.NaN, 0]))).toBe("E_USAGE");
    expect(code(() => moveObject(scene, "free", [0, Infinity]))).toBe("E_USAGE");
  });

  it("throws E_REF for an unknown object", () => {
    expect(code(() => moveObject(scene, "nope", [0, 0]))).toBe("E_REF");
  });
});

describe("setRotation", () => {
  it("turns an object", () => {
    const next = setRotation(scene, "free", 270).scene;
    expect(next.objects[0]!.rot).toBe(270);
  });

  it("is blocked by a rot lock", () => {
    const result = setRotation(scene, "turn", 180);
    expect(result.scene).toBe(scene);
    expect(result.blocked).toEqual(["rot"]);
  });

  it("does not add a rot key when the value is already the default", () => {
    const bare = makeScene({ objects: [{ id: "x", type: "box", pos: [0, 0] }] });
    expect(setRotation(bare, "x", 0).scene).toBe(bare);
  });

  it("accepts only quarter turns", () => {
    expect(code(() => setRotation(scene, "free", 45 as 0))).toBe("E_USAGE");
  });
});

describe("setObjectType", () => {
  it("changes the type", () => {
    expect(setObjectType(scene, "free", "tall").scene.objects[0]!.type).toBe("tall");
  });

  it("is blocked by a type lock", () => {
    const result = setObjectType(scene, "turn", "tall");
    expect(result.scene).toBe(scene);
    expect(result.blocked).toEqual(["type"]);
  });

  it("throws E_REF for a type that does not exist", () => {
    expect(code(() => setObjectType(scene, "free", "ghost"))).toBe("E_REF");
  });
});

describe("setTypeSize", () => {
  it("changes one number of a type and keeps the other types", () => {
    const { scene: next, blocked } = setTypeSize(scene, "box", 1, 2.5);
    expect(blocked).toEqual([]);
    expect(next.types.box!.size).toEqual([1, 2.5, 1]);
    expect(next.types.tall).toBe(scene.types.tall);
    expect(scene.types.box!.size).toEqual([1, 1, 1]);
  });

  it("is blocked when any object locks that JSON Pointer", () => {
    const result = setTypeSize(scene, "tall", 2, 4);
    expect(result.scene).toBe(scene);
    expect(result.blocked).toEqual(["/types/tall/size/2"]);
  });

  it("is not blocked by the lock of another number", () => {
    expect(setTypeSize(scene, "tall", 0, 2).blocked).toEqual([]);
  });

  it("updates the matching assumption", () => {
    const next = setTypeSize(scene, "box", 0, 1.25).scene;
    expect(next.assumptions![2]).toEqual({ path: "/types/box/size/0", value: 1.25 });
  });

  it("rejects negative and non-finite sizes", () => {
    expect(code(() => setTypeSize(scene, "box", 0, -1))).toBe("E_SCHEMA");
    expect(code(() => setTypeSize(scene, "box", 0, Number.NaN))).toBe("E_USAGE");
  });

  it("throws E_REF for an unknown type", () => {
    expect(code(() => setTypeSize(scene, "ghost", 0, 1))).toBe("E_REF");
  });
});

describe("edits on a fixture", () => {
  it("moves one of 200 objects and shares the other 199", () => {
    const crowd = loadScene("crowd");
    const next = moveObject(crowd, "o150", [3.5, 3.5]).scene;
    const shared = next.objects.filter((o, i) => o === crowd.objects[i]).length;
    expect(shared).toBe(199);
  });

  it("blocks the locked objects of the fixture", () => {
    const crowd = loadScene("crowd");
    expect(moveObject(crowd, "o010", [0, 0]).blocked).toEqual(["pos"]);
    expect(moveObject(crowd, "o020", [0, 5]).blocked).toEqual(["pos.u"]);
    expect(moveObject(crowd, "o030", [5, 0]).blocked).toEqual(["pos.v"]);
  });
});
