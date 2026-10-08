import { describe, expect, it } from "vitest";
import { runtimeSprite } from "../../src/core/export/runtime";
import { orderDirection } from "../../src/core/projection";
import { sortKey, spritesOf } from "../../src/core/sort/sprites";
import { expectSameJson } from "../helpers/exportCases";
import { boxOf, loadGoldenSort, rectOf } from "../helpers/sort";

const golden = loadGoldenSort();

describe("tests/golden/sort.json: sort keys", () => {
  it("lists keys and slices", () => {
    expect(golden.keys.length).toBeGreaterThan(10);
    expect(golden.slices.length).toBeGreaterThan(10);
    expect(golden.tolerance).toBeGreaterThan(0);
  });

  golden.keys.forEach((entry, i) => {
    it(`key ${i}: footprint [${entry.footprint.join(", ")}] under angleU ${entry.camera.angleU} is ${entry.key}`, () => {
      const key = sortKey(orderDirection(entry.camera), rectOf(entry.footprint));
      expect(Math.abs(key - entry.key)).toBeLessThanOrEqual(golden.tolerance);
    });
  });
});

describe("tests/golden/sort.json: sprites of an object", () => {
  for (const entry of golden.slices) {
    it(`${entry.name}: gives the sprites, keys, footprints and pieces of the file`, () => {
      const parts = entry.parts.map((p) => ({ id: p.id, box: boxOf(p.box), order: p.order }));
      const sprites = spritesOf(orderDirection(entry.camera), rectOf(entry.footprint), parts).map(runtimeSprite);
      expectSameJson(JSON.parse(JSON.stringify(sprites)), entry.sprites, golden.tolerance, entry.name);
    });
  }
});
