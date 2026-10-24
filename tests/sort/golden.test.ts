import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runtimeSprite } from "../../src/core/export/runtime";
import { orderDirection } from "../../src/core/projection";
import { sortKey, spritesOf } from "../../src/core/sort/sprites";
import { expectSameJson } from "../helpers/exportCases";
import { goldenDir } from "../helpers/fixtures";
import { boxOf, loadGoldenSort, rectOf, type GoldenSort } from "../helpers/sort";

const golden = loadGoldenSort();
const levels = JSON.parse(readFileSync(join(goldenDir, "sort-levels.json"), "utf8")) as GoldenSort;

describe("tests/golden/sort.json: sort keys", () => {
  it("lists keys and slices", () => {
    expect(golden.keys.length).toBeGreaterThan(10);
    expect(golden.slices.length).toBeGreaterThan(10);
    expect(golden.tolerance).toBeGreaterThan(0);
  });

  golden.keys.forEach((entry, i) => {
    it(`key ${i}: footprint [${entry.footprint.join(", ")}] is ${entry.key}`, () => {
      const key = sortKey(orderDirection(entry.camera), rectOf(entry.footprint), entry.base ?? 0);
      expect(Math.abs(key - entry.key)).toBeLessThanOrEqual(golden.tolerance);
    });
  });
});

describe("tests/golden/sort.json: sprites of an object", () => {
  for (const entry of golden.slices) {
    it(`${entry.name}: gives the sprites, keys, footprints and pieces of the file`, () => {
      const parts = entry.parts.map((p) => ({ id: p.id, box: boxOf(p.box), order: p.order }));
      const sprites = spritesOf(orderDirection(entry.camera), rectOf(entry.footprint), parts, entry.base ?? 0).map(runtimeSprite);
      expectSameJson(JSON.parse(JSON.stringify(sprites)), entry.sprites, golden.tolerance, entry.name);
    });
  }
});

describe("tests/golden/sort-levels.json: keys and weighted slices", () => {
  it("lists keys at base heights and slices under view-form cameras", () => {
    expect(levels.keys.length).toBeGreaterThan(0);
    expect(levels.slices.length).toBeGreaterThan(0);
  });

  levels.keys.forEach((entry, i) => {
    it(`key ${i} at base ${entry.base ?? 0} is ${entry.key}`, () => {
      const key = sortKey(orderDirection(entry.camera), rectOf(entry.footprint), entry.base ?? 0);
      expect(Math.abs(key - entry.key)).toBeLessThanOrEqual(levels.tolerance);
    });
  });

  for (const entry of levels.slices) {
    it(`${entry.name}: sprites weighted by the camera`, () => {
      const parts = entry.parts.map((p) => ({ id: p.id, box: boxOf(p.box), order: p.order }));
      const sprites = spritesOf(orderDirection(entry.camera), rectOf(entry.footprint), parts, entry.base ?? 0).map(runtimeSprite);
      expectSameJson(JSON.parse(JSON.stringify(sprites)), entry.sprites, levels.tolerance, entry.name);
    });
  }
});
