import { describe, expect, it } from "vitest";
import { footprint, rectGap, rectsOverlap, sizeBox, worldParts, worldPoint } from "../../src/core/geometry";
import type { Rot } from "../../src/core/types";
import { makeScene } from "../helpers/scene";

const scene = (rot: Rot) =>
  makeScene({
    types: {
      t: {
        size: [4, 2, 3],
        parts: [
          { id: "p", box: [0, 0, 0, 1, 1, 1] },
          { id: "q", box: [1, 0.5, 2, 4, 2, 3] },
        ],
      },
      plain: { size: [2, 1, 1] },
    },
    objects: [
      { id: "o", type: "t", pos: [10, 20], rot },
      { id: "n", type: "plain", pos: [0, 0] },
    ],
  });

function rect(s: ReturnType<typeof scene>) {
  return footprint(s, s.objects[0]!);
}

describe("geometry: footprint", () => {
  it("uses w x d at rotation 0 and 180", () => {
    expect(rect(scene(0))).toEqual({ u0: 10, v0: 20, u1: 14, v1: 22 });
    expect(rect(scene(180))).toEqual({ u0: 10, v0: 20, u1: 14, v1: 22 });
  });

  it("swaps to d x w at rotation 90 and 270", () => {
    expect(rect(scene(90))).toEqual({ u0: 10, v0: 20, u1: 12, v1: 24 });
    expect(rect(scene(270))).toEqual({ u0: 10, v0: 20, u1: 12, v1: 24 });
  });

  it("defaults the rotation to 0", () => {
    const s = scene(0);
    const { rot: _rot, ...bare } = s.objects[0]!;
    expect(footprint({ ...s, objects: [bare] }, bare)).toEqual({ u0: 10, v0: 20, u1: 14, v1: 22 });
  });

  it("builds the size box from the footprint and the type height", () => {
    expect(sizeBox(scene(90), scene(90).objects[0]!)).toEqual({ u0: 10, v0: 20, h0: 0, u1: 12, v1: 24, h1: 3 });
  });
});

describe("geometry: parts", () => {
  const byId = (rot: Rot) => {
    const s = scene(rot);
    return Object.fromEntries(worldParts(s, s.objects[0]!).map((p) => [p.id, p.box]));
  };

  it("places parts at rotation 0", () => {
    expect(byId(0).p).toEqual({ u0: 10, v0: 20, h0: 0, u1: 11, v1: 21, h1: 1 });
    expect(byId(0).q).toEqual({ u0: 11, v0: 20.5, h0: 2, u1: 14, v1: 22, h1: 3 });
  });

  it("rotates parts about the footprint center, from +u toward +v", () => {
    expect(byId(90).p).toEqual({ u0: 11, v0: 20, h0: 0, u1: 12, v1: 21, h1: 1 });
    expect(byId(180).p).toEqual({ u0: 13, v0: 21, h0: 0, u1: 14, v1: 22, h1: 1 });
    expect(byId(270).p).toEqual({ u0: 10, v0: 23, h0: 0, u1: 11, v1: 24, h1: 1 });
  });

  it("keeps every rotated part inside the rotated footprint", () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const s = scene(rot);
      const f = footprint(s, s.objects[0]!);
      for (const p of worldParts(s, s.objects[0]!)) {
        expect(p.box.u0).toBeGreaterThanOrEqual(f.u0 - 1e-9);
        expect(p.box.u1).toBeLessThanOrEqual(f.u1 + 1e-9);
        expect(p.box.v0).toBeGreaterThanOrEqual(f.v0 - 1e-9);
        expect(p.box.v1).toBeLessThanOrEqual(f.v1 + 1e-9);
      }
    }
  });

  it("gives a type without parts one part that is the whole size box", () => {
    const s = scene(0);
    const parts = worldParts(s, s.objects[1]!);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.box).toEqual({ u0: 0, v0: 0, h0: 0, u1: 2, v1: 1, h1: 1 });
  });
});

describe("geometry: overlap and gap", () => {
  const r = (u0: number, v0: number, u1: number, v1: number) => ({ u0, v0, u1, v1 });

  it("needs a positive intersection along both axes", () => {
    expect(rectsOverlap(r(0, 0, 1, 1), r(0.5, 0.5, 2, 2))).toBe(true);
    expect(rectsOverlap(r(0, 0, 1, 1), r(1, 0, 2, 1))).toBe(false);
    expect(rectsOverlap(r(0, 0, 1, 1), r(1, 1, 2, 2))).toBe(false);
    expect(rectsOverlap(r(0, 0, 1, 1), r(0, 2, 1, 3))).toBe(false);
  });

  it("measures the edge-to-edge distance", () => {
    expect(rectGap(r(0, 0, 1, 1), r(3, 0, 4, 1))).toBe(2);
    expect(rectGap(r(0, 0, 1, 1), r(4, 5, 5, 6))).toBe(5);
    expect(rectGap(r(0, 0, 2, 2), r(1, 1, 3, 3))).toBe(0);
  });
});

describe("geometry: worldPoint", () => {
  it("maps the corners of the type footprint onto the corners of the rotated footprint", () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const s = scene(rot);
      const o = s.objects[0]!;
      const f = footprint(s, o);
      const a = worldPoint(s, o, 0, 0);
      const b = worldPoint(s, o, 4, 2);
      expect([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]).toEqual([f.u0, f.v0, f.u1, f.v1]);
    }
  });

  it("agrees with the rotation of parts", () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const s = scene(rot);
      const o = s.objects[0]!;
      const q = worldParts(s, o).find((p) => p.id === "q")!.box;
      const a = worldPoint(s, o, 1, 0.5);
      const b = worldPoint(s, o, 4, 2);
      expect([Math.min(a[0], b[0]), Math.min(a[1], b[1])]).toEqual([q.u0, q.v0]);
      expect([Math.max(a[0], b[0]), Math.max(a[1], b[1])]).toEqual([q.u1, q.v1]);
    }
  });

  it("puts an off-centre point at the right place for a quarter turn", () => {
    const s = scene(90);
    expect(worldPoint(s, s.objects[0]!, 1, 0)).toEqual([12, 21]);
  });
});
