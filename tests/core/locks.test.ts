import { describe, expect, it } from "vitest";
import { isPathLocked, lockedAxes, lockHolder, setLock } from "../../src/core/locks";
import { box, makeScene } from "../helpers/scene";

const scene = makeScene({
  objects: [
    { ...box("a", [0, 0]), locks: ["pos"] },
    { ...box("b", [2, 0]), locks: ["pos.u", "/types/box/size/2"] },
    { ...box("c", [4, 0]), locks: ["rot"] },
    box("d", [6, 0]),
  ],
});
const [a, b, c, d] = scene.objects;

describe("locks: queries", () => {
  it("treats a pos lock as a lock on both axes", () => {
    expect(isPathLocked(a!, "pos")).toBe(true);
    expect(isPathLocked(a!, "pos.u")).toBe(true);
    expect(isPathLocked(a!, "pos.v")).toBe(true);
    expect(lockedAxes(a!)).toEqual({ u: true, v: true });
  });

  it("locks one axis only for pos.u or pos.v", () => {
    expect(lockedAxes(b!)).toEqual({ u: true, v: false });
    expect(isPathLocked(b!, "pos")).toBe(false);
  });

  it("does not let other locks affect the position", () => {
    expect(lockedAxes(c!)).toEqual({ u: false, v: false });
    expect(isPathLocked(c!, "rot")).toBe(true);
    expect(isPathLocked(c!, "type")).toBe(false);
  });

  it("reports no locks for an object without a locks list", () => {
    expect(lockedAxes(d!)).toEqual({ u: false, v: false });
    expect(isPathLocked(d!, "rot")).toBe(false);
  });

  it("finds the object that holds a JSON Pointer lock", () => {
    expect(lockHolder(scene, "/types/box/size/2")).toBe("b");
    expect(lockHolder(scene, "/types/box/size/0")).toBeUndefined();
  });
});

describe("locks: setLock", () => {
  it("adds a lock without touching the input scene", () => {
    const next = setLock(scene, "d", "rot", true);
    expect(next.objects[3]!.locks).toEqual(["rot"]);
    expect(scene.objects[3]!.locks).toBeUndefined();
    expect(next.objects[0]).toBe(scene.objects[0]);
  });

  it("is idempotent and returns the same scene when nothing changes", () => {
    expect(setLock(scene, "a", "pos", true)).toBe(scene);
    expect(setLock(scene, "d", "rot", false)).toBe(scene);
  });

  it("keeps locks in a fixed order whatever the order of toggling", () => {
    const one = setLock(setLock(setLock(scene, "d", "type", true), "d", "pos.v", true), "d", "rot", true);
    const two = setLock(setLock(setLock(scene, "d", "rot", true), "d", "type", true), "d", "pos.v", true);
    expect(one.objects[3]!.locks).toEqual(["pos.v", "rot", "type"]);
    expect(two.objects[3]!.locks).toEqual(["pos.v", "rot", "type"]);
  });

  it("replaces axis locks when the whole position is locked", () => {
    const next = setLock(scene, "b", "pos", true);
    expect(next.objects[1]!.locks).toEqual(["pos", "/types/box/size/2"]);
  });

  it("drops the locks key when the last lock is removed", () => {
    const next = setLock(scene, "a", "pos", false);
    expect("locks" in next.objects[0]!).toBe(false);
  });

  it("removes only the exact entry", () => {
    const next = setLock(scene, "b", "pos.u", false);
    expect(next.objects[1]!.locks).toEqual(["/types/box/size/2"]);
  });

  it("throws E_REF for an unknown object", () => {
    expect(() => setLock(scene, "zz", "pos", true)).toThrowError(/unknown object/);
  });
});
