import { describe, expect, it } from "vitest";
import { EPS, type Box, type Rect } from "../../src/core/geometry";
import { MAX_SLICES, sceneSprites, sortKey, spritesOf, type OrderedPart } from "../../src/core/sort/sprites";
import { makeScene } from "../helpers/scene";

/** True isometric: c = (1, 1, 1). */
const C = [1, 1, 1] as const;
const rect = (u0: number, v0: number, u1: number, v1: number): Rect => ({ u0, v0, u1, v1 });
const box = (u0: number, v0: number, h0: number, u1: number, v1: number, h1: number): Box => ({ u0, v0, h0, u1, v1, h1 });
const body = (r: Rect, h = 1): OrderedPart[] => [{ id: "body", box: box(r.u0, r.v0, 0, r.u1, r.v1, h), order: 0 }];

describe("sortKey", () => {
  it("is twice the depth of the footprint center, rounded to 6 decimals", () => {
    expect(sortKey(C, rect(0, 0, 1, 1))).toBe(2);
    expect(sortKey([0.5, 2, 1], rect(0.123457, 0.765432, 0.5, 1))).toBe(3.842593);
    expect(sortKey([0, 1, 1], rect(5, 3, 6, 4))).toBe(7);
  });

  it("adds a value of 0 for a footprint at the origin without a signed zero", () => {
    expect(Object.is(sortKey(C, rect(0, 0, 0, 0)), 0)).toBe(true);
    expect(Object.is(sortKey(C, rect(-1, 0, 1, 0)), 0)).toBe(true);
  });
});

describe("spritesOf: one sprite", () => {
  it("makes one sprite of a square footprint, with its whole part boxes", () => {
    const sprites = spritesOf(C, rect(0, 0, 1, 1), body(rect(0, 0, 1, 1)));
    expect(sprites).toHaveLength(1);
    expect(sprites[0]).toEqual({ key: 2, footprint: rect(0, 0, 1, 1), pieces: [{ part: "body", box: box(0, 0, 0, 1, 1, 1) }] });
  });

  it("treats a difference of up to EPS between the sides as a square", () => {
    expect(spritesOf(C, rect(0, 0, 1 + EPS / 2, 1), body(rect(0, 0, 1, 1)))).toHaveLength(1);
  });

  it("makes one sprite of a footprint with no width or no depth", () => {
    expect(spritesOf(C, rect(0, 0, 3, 0), body(rect(0, 0, 3, 0)))).toHaveLength(1);
    expect(spritesOf(C, rect(0, 0, 0, 3), body(rect(0, 0, 0, 3)))).toHaveLength(1);
  });

  it("keeps the whole boxes of an object of one sprite, also those that stick out of the footprint", () => {
    const parts: OrderedPart[] = [
      { id: "trunk", box: box(0.4, 0.4, 0, 0.8, 0.8, 1), order: 0 },
      { id: "canopy", box: box(-0.2, -0.2, 1, 1.2, 1.2, 2), order: 1 },
    ];
    const pieces = spritesOf(C, rect(0, 0, 1, 1), parts)[0]!.pieces;
    expect(pieces.map((p) => p.box)).toEqual(parts.map((p) => p.box));
  });

  it("keeps a part without length along the long axis when the object has one sprite", () => {
    const parts: OrderedPart[] = [{ id: "plate", box: box(0, 0, 0, 0, 1, 1), order: 0 }];
    expect(spritesOf(C, rect(0, 0, 1, 1), parts)[0]!.pieces).toHaveLength(1);
  });
});

describe("spritesOf: slices", () => {
  it("chooses the number of slices whose length is closest to the short side", () => {
    expect(spritesOf(C, rect(0, 0, 4, 0.8), body(rect(0, 0, 4, 0.8)))).toHaveLength(5);
    expect(spritesOf(C, rect(0, 0, 1.2, 0.8), body(rect(0, 0, 1.2, 0.8)))).toHaveLength(2);
    expect(spritesOf(C, rect(0, 0, 0.8, 4), body(rect(0, 0, 0.8, 4)))).toHaveLength(5);
  });

  it("keeps the smaller number on a tie, within EPS", () => {
    // 4 x 3: one slice is 1 away from 3, two slices of 2 are 1 away as well.
    expect(spritesOf(C, rect(0, 0, 4, 3), body(rect(0, 0, 4, 3)))).toHaveLength(1);
    expect(spritesOf(C, rect(0, 0, 4 + EPS / 2, 3), body(rect(0, 0, 4, 3)))).toHaveLength(1);
  });

  it("cuts at most 64 slices", () => {
    expect(MAX_SLICES).toBe(64);
    expect(spritesOf(C, rect(0, 0, 1000, 0.01), body(rect(0, 0, 1000, 0.01)))).toHaveLength(64);
  });

  it("splits the long axis evenly and rounds the inner boundaries to 6 decimals", () => {
    const sprites = spritesOf(C, rect(0, 0, 1, 0.3), body(rect(0, 0, 1, 0.3)));
    expect(sprites.map((s) => [s.footprint.u0, s.footprint.u1])).toEqual([[0, 0.333333], [0.333333, 0.666667], [0.666667, 1]]);
    // The outer boundaries are the footprint itself.
    expect(sprites[0]!.footprint.u0).toBe(0);
    expect(sprites[2]!.footprint.u1).toBe(1);
  });

  it("gives each slice the full footprint along the other axis and its own key", () => {
    const sprites = spritesOf(C, rect(2, 3, 3.4, 4), body(rect(2, 3, 3.4, 4)));
    expect(sprites.map((s) => [s.footprint.v0, s.footprint.v1])).toEqual([[3, 4], [3, 4]]);
    expect(sprites.map((s) => s.key)).toEqual([11.7, 13.1]);
  });

  it("slices along v when the footprint is longer along v", () => {
    const sprites = spritesOf(C, rect(0.5, 1.5, 0.8, 5.5), body(rect(0.5, 1.5, 0.8, 5.5)));
    expect(sprites).toHaveLength(13);
    expect(sprites.every((s) => s.footprint.u0 === 0.5 && s.footprint.u1 === 0.8)).toBe(true);
    expect(sprites[0]!.footprint.v0).toBe(1.5);
    expect(sprites[12]!.footprint.v1).toBe(5.5);
  });

  it("cuts part boxes to each slice and lets the end slices reach beyond the footprint", () => {
    const parts: OrderedPart[] = [
      { id: "base", box: box(0, 0, 0, 3, 1, 0.9), order: 0 },
      { id: "top", box: box(-0.2, -0.1, 0.9, 3.2, 1.1, 1), order: 1 },
    ];
    const sprites = spritesOf(C, rect(0, 0, 3, 1), parts);
    expect(sprites).toHaveLength(3);
    expect(sprites.map((s) => s.pieces.map((p) => p.box.u0))).toEqual([[0, -0.2], [1, 1], [2, 2]]);
    expect(sprites.map((s) => s.pieces.map((p) => p.box.u1))).toEqual([[1, 1], [2, 2], [3, 3.2]]);
    // Heights and the other axis are not cut.
    expect(sprites[1]!.pieces.map((p) => [p.box.v0, p.box.v1, p.box.h0, p.box.h1])).toEqual([[0, 1, 0, 0.9], [-0.1, 1.1, 0.9, 1]]);
  });

  it("leaves out a piece that is no longer than EPS along the long axis", () => {
    const parts: OrderedPart[] = [
      { id: "base", box: box(0, 0, 0, 3, 1, 1), order: 0 },
      { id: "pillar", box: box(0, 0, 0, 0.5, 1, 2), order: 1 },
    ];
    const sprites = spritesOf(C, rect(0, 0, 3, 1), parts);
    expect(sprites.map((s) => s.pieces.map((p) => p.part))).toEqual([["base", "pillar"], ["base"], ["base"]]);
  });

  it("lists the pieces of a sprite in ascending painter's order of their parts", () => {
    const parts: OrderedPart[] = [
      { id: "top", box: box(0, 0, 0.9, 3, 1, 1), order: 9 },
      { id: "base", box: box(0, 0, 0, 3, 1, 0.9), order: 7 },
    ];
    for (const sprite of spritesOf(C, rect(0, 0, 3, 1), parts)) expect(sprite.pieces.map((p) => p.part)).toEqual(["base", "top"]);
    expect(spritesOf(C, rect(0, 0, 1, 1), parts)[0]!.pieces.map((p) => p.part)).toEqual(["base", "top"]);
  });
});

describe("sceneSprites", () => {
  const scene = makeScene({
    types: { block: { size: [1, 1, 1] }, wall: { size: [4, 0.8, 1] } },
    objects: [
      { id: "a", type: "block", pos: [0, 0] },
      { id: "w", type: "wall", pos: [2, 0], rot: 90 },
      { id: "b", type: "block", pos: [5, 0] },
    ],
  });
  const sprites = sceneSprites(scene);

  it("lists the sprites of each object in file order, with a sprite for every object", () => {
    expect(sprites.map((s) => s.length)).toEqual([1, 5, 1]);
  });

  it("slices a rotated wall along the axis that is long after the rotation, in ascending order", () => {
    const wall = sprites[1]!;
    expect(wall[0]!.footprint).toEqual(rect(2, 0, 2.8, 0.8));
    expect(wall[4]!.footprint).toEqual(rect(2, 3.2, 2.8, 4));
    const keys = wall.map((s) => s.key);
    expect(keys).toEqual([...keys].sort((x, y) => x - y));
  });

  it("rounds footprints and boxes to 6 decimals before it cuts", () => {
    const odd = makeScene({ types: { block: { size: [1, 1, 1] } }, objects: [{ id: "a", type: "block", pos: [0.1234567891, 0.2] }] });
    const sprite = sceneSprites(odd)[0]![0]!;
    expect(sprite.footprint.u0).toBe(0.123457);
    expect(sprite.pieces[0]!.box.u0).toBe(0.123457);
  });

  it("has no sprites for a scene without objects", () => {
    expect(sceneSprites(makeScene())).toEqual([]);
  });
});
