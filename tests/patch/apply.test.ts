import { describe, expect, it } from "vitest";
import { applyPatch } from "../../src/core/patch/apply";
import { parsePatch } from "../../src/core/patch/parse";
import type { Scene } from "../../src/core/types";
import { makeScene } from "../helpers/scene";

function scene(overrides: Record<string, unknown> = {}): Scene {
  return makeScene({
    types: { box: { size: [1, 1, 1] }, plank: { size: [1.2, 0.4, 0.5] } },
    objects: [
      { id: "a", type: "box", pos: [0, 5] },
      { id: "p", type: "plank", pos: [3.4, 2.6], rot: 0 },
      { id: "n", type: "plank", pos: [1, 1] },
    ],
    ...overrides,
  });
}

function apply(text: string, base: Scene = scene()): any {
  return applyPatch(base, parsePatch(text));
}

function code(text: string, base: Scene = scene()): string {
  try {
    apply(text, base);
  } catch (e) {
    return (e as { code: string }).code;
  }
  return "none";
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe("move", () => {
  it("adds to pos and leaves the other axis alone", () => {
    expect(apply("move a u+1.5").objects[0].pos).toEqual([1.5, 5]);
    expect(apply("move a v-2").objects[0].pos).toEqual([0, 3]);
    expect(apply("move a u+1 v+2").objects[0].pos).toEqual([1, 7]);
  });

  it("rounds computed coordinates to 6 decimals", () => {
    expect(apply("move a u+0.1234567").objects[0].pos[0]).toBe(0.123457);
    const base = scene({ objects: [{ id: "a", type: "box", pos: [0.1, 0.2] }] });
    expect(apply("move a u+0.2 v+0.1", base).objects[0].pos).toEqual([0.3, 0.3]);
  });

  it("accumulates over several commands", () => {
    expect(apply("move a u+1\nmove a u+1\nmove a v+1").objects[0].pos).toEqual([2, 6]);
  });

  it("fails for an unknown object and names the line", () => {
    expect(code("move ghost u+1")).toBe("E_PATCH");
    expect(() => apply("# note\n\nmove ghost u+1")).toThrowError(/line 3: unknown object "ghost"/);
  });
});

describe("rot", () => {
  const center = (o: { pos: number[]; rot?: number }, w: number, d: number): number[] => {
    const turned = (o.rot ?? 0) % 180 !== 0;
    return [o.pos[0] + (turned ? d : w) / 2, o.pos[1] + (turned ? w : d) / 2];
  };

  it("keeps the footprint center for every pair of rotations", () => {
    const base = scene({ objects: [{ id: "p", type: "plank", pos: [3.4, 2.6], rot: 0 }] });
    const start = center(base.objects[0] as never, 1.2, 0.4);
    for (const rot of [0, 90, 180, 270]) {
      const next = apply(`rot p ${rot}`, base).objects[0];
      expect(next.rot, `rot ${rot}`).toBe(rot);
      center(next, 1.2, 0.4).forEach((n, i) => expect(Math.abs(n - (start[i] as number)), `rot ${rot} axis ${i}`).toBeLessThan(1e-6));
    }
  });

  it("gives the recomputed pos from the example (bench turned across the path)", () => {
    expect(apply("rot p 90").objects[1]).toMatchObject({ pos: [3.8, 2.2], rot: 90 });
  });

  it("rounds the recomputed pos to 6 decimals", () => {
    const base = scene({ objects: [{ id: "p", type: "plank", pos: [0.1234567, 0], rot: 0 }] });
    // center u = 0.1234567 + 1.2 / 2; new pos.u = center - 0.4 / 2 = 0.5234567
    expect(apply("rot p 90", base).objects[0].pos[0]).toBe(0.523457);
  });

  it("changes nothing when the rotation is already that value", () => {
    const base = scene({ objects: [{ id: "p", type: "plank", pos: [0.1234567, 0], rot: 90 }] });
    expect(apply("rot p 90", base).objects[0]).toEqual({ id: "p", type: "plank", pos: [0.1234567, 0], rot: 90 });
    expect(apply("rot n 0").objects[2]).toEqual({ id: "n", type: "plank", pos: [1, 1] });
  });

  it("adds rot to an object that has none, and keeps pos when the footprint stays the same", () => {
    expect(apply("rot n 180").objects[2]).toEqual({ id: "n", type: "plank", pos: [1, 1], rot: 180 });
    const base = scene({ objects: [{ id: "p", type: "plank", pos: [0.1234567, 0], rot: 0 }] });
    expect(apply("rot p 180", base).objects[0].pos).toEqual([0.1234567, 0]);
  });

  it("fails for an unknown object", () => {
    expect(code("rot ghost 90")).toBe("E_PATCH");
  });
});

describe("set", () => {
  it("replaces the value at an existing pointer", () => {
    expect(apply("set /types/box/size/2 3").types.box.size).toEqual([1, 1, 3]);
    expect(apply("set /objects/0/pos [4, 4]".replace("[4, 4]", '"[4, 4]"')).objects[0].pos).toEqual([4, 4]);
    expect(apply("set /id other").id).toBe("other");
  });

  it("fails when the pointer does not resolve", () => {
    expect(code("set /types/box/size/3 1")).toBe("E_PATCH");
    expect(code("set /types/ghost/size 1")).toBe("E_PATCH");
    expect(code("set /objects/9 1")).toBe("E_PATCH");
  });

  it("replaces the note of the assumption with that path, adds one when it has none", () => {
    const base = scene({ assumptions: [{ path: "/types/box/size/2", value: 1, note: "old" }, { path: "/types/plank/size/2", value: 0.5 }] });
    const a = apply('set /types/box/size/2 2 note="new note"', base);
    expect(a.assumptions[0]).toEqual({ path: "/types/box/size/2", value: 2, note: "new note" });
    const b = apply("set /types/plank/size/2 0.6 note=hello", base);
    expect(b.assumptions[1]).toEqual({ path: "/types/plank/size/2", value: 0.6, note: "hello" });
  });

  it("fails when note= is given and there is no assumption for the pointer", () => {
    expect(code('set /types/box/size/2 2 note="x"')).toBe("E_PATCH");
    const base = scene({ assumptions: [{ path: "/types/box/size/2", value: 1 }] });
    expect(code('set /types/box/size/1 2 note="x"', base)).toBe("E_PATCH");
  });
});

describe("assumptions follow their paths", () => {
  const base = () => scene({
    assumptions: [
      { path: "/types/box/size/2", value: 1 },
      { path: "/objects/0/pos/0", value: 0 },
      { path: "/types/plank/size", value: [1.2, 0.4, 0.5] },
    ],
  });

  it("after a set, a move and a JSON Patch", () => {
    expect(apply("set /types/box/size/2 2.5", base()).assumptions[0].value).toBe(2.5);
    expect(apply("move a u+0.75", base()).assumptions[1].value).toBe(0.75);
    expect(apply('[{"op":"replace","path":"/types/plank/size/0","value":2}]', base()).assumptions[2].value).toEqual([2, 0.4, 0.5]);
  });

  it("also fixes a value that was already out of step before the patch", () => {
    const stale = scene({ assumptions: [{ path: "/types/box/size/2", value: 99 }] });
    expect(apply("lock a pos", stale).assumptions[0].value).toBe(1);
  });

  it("leaves an assumption whose path no longer resolves for validation", () => {
    const out = apply('[{"op":"remove","path":"/types/plank"}]', base());
    expect(out.assumptions[2]).toEqual({ path: "/types/plank/size", value: [1.2, 0.4, 0.5] });
  });
});

describe("lock", () => {
  it("appends only the locks the object does not have", () => {
    const base = scene({ objects: [{ id: "a", type: "box", pos: [0, 0], locks: ["pos"] }] });
    expect(apply("lock a pos rot", base).objects[0].locks).toEqual(["pos", "rot"]);
    expect(apply("lock a pos", base).objects[0]).toEqual(base.objects[0]);
  });

  it("creates the list, keeps pointer locks as written, and does not fold pos.u into pos", () => {
    expect(apply("lock a /types/box/size/0 pos").objects[0].locks).toEqual(["/types/box/size/0", "pos"]);
    const base = scene({ objects: [{ id: "a", type: "box", pos: [0, 0], locks: ["pos"] }] });
    expect(apply("lock a pos.u", base).objects[0].locks).toEqual(["pos", "pos.u"]);
  });

  it("fails for an unknown object", () => {
    expect(code("lock ghost pos")).toBe("E_PATCH");
  });
});

describe("relate", () => {
  it("takes the first free id", () => {
    const base = scene({ relations: [{ id: "r1", a: "a", rel: "left_of", b: "p" }, { id: "r3", a: "a", rel: "left_of", b: "p" }] });
    expect(apply("relate a right_of p", base).relations[2].id).toBe("r2");
    expect(apply("relate a right_of p", scene()).relations).toEqual([{ id: "r1", a: "a", rel: "right_of", b: "p", hard: false }]);
  });

  it("writes the fields in the documented order and keeps an explicit id", () => {
    const out = apply('relate a in_front_of p gap 1..1.5 hard weight 2 id=front source="a b"');
    expect(Object.keys(out.relations[0])).toEqual(["id", "a", "rel", "b", "gap", "hard", "weight", "source"]);
    expect(out.relations[0]).toEqual({ id: "front", a: "a", rel: "in_front_of", b: "p", gap: [1, 1.5], hard: true, weight: 2, source: "a b" });
  });

  it("appends several relations with consecutive ids", () => {
    const out = apply("relate a left_of p\nrelate a right_of n");
    expect(out.relations.map((r: { id: string }) => r.id)).toEqual(["r1", "r2"]);
  });
});

describe("a patch is atomic and does not change its input", () => {
  it("leaves the input scene as it was, also when a later command fails", () => {
    const base = deepFreeze(scene({ assumptions: [{ path: "/types/box/size/2", value: 1 }] }));
    const before = structuredClone(base);
    expect(() => apply("move a u+1\nset /types/box/size/2 5\nmove ghost u+1", base)).toThrow();
    expect(base).toEqual(before);
    apply("move a u+1\nrot p 90\nset /types/box/size/2 5\nlock a pos\nrelate a left_of p", base);
    expect(base).toEqual(before);
  });

  it("applies an empty patch and a patch of only comments without change", () => {
    expect(apply("")).toEqual(scene());
    expect(apply("# only a comment\n")).toEqual(scene());
  });
});
