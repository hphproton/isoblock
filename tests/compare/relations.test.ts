import { describe, expect, it } from "vitest";
import { compareVariants } from "../../src/core/compare/compare";
import { compareJson, formatCompareMarkdown, formatCompareText } from "../../src/core/compare/format";
import { expectMatchesCompare, loadScene, near, readCompareFile, type CompareExpected } from "../helpers/fixtures";

describe("compare --relations fixture", () => {
  const variants = ["A", "B", "C", "D"].map((name) => ({ name, text: readCompareFile(`yard.${name}.patch`) }));
  const comparison = compareVariants(loadScene("yard"), variants, undefined, true);
  const expected = JSON.parse(readCompareFile("yard.relations.expected.json")) as CompareExpected & {
    hardViolated: readonly (readonly string[])[];
    softPenalty: readonly number[];
  };

  it("gives yard.relations.expected.json within tolerance", () => {
    const actual = JSON.parse(JSON.stringify(compareJson(comparison))) as Record<string, any>;
    expectMatchesCompare(actual, expected);
    expect(actual.hardViolated, "hardViolated").toEqual(expected.hardViolated);
    near(actual.softPenalty, expected.softPenalty, expected.tolerance.value, "softPenalty");
    expect(Object.keys(actual)).toEqual([
      "scene", "state", "variants", "failing", "locksTouched", "hardViolated", "softPenalty", "moved", "checks",
    ]);
  });

  it("gives yard.relations.expected.txt byte for byte", () => {
    expect(`${formatCompareText(comparison)}\n`).toBe(readCompareFile("yard.relations.expected.txt"));
  });

  it("gives yard.relations.expected.md byte for byte", () => {
    expect(`${formatCompareMarkdown(comparison)}\n`).toBe(readCompareFile("yard.relations.expected.md"));
  });

  it("leaves the relation rows out without the flag", () => {
    const plain = compareJson(compareVariants(loadScene("yard"), variants));
    expect(plain).not.toHaveProperty("hardViolated");
    expect(plain).not.toHaveProperty("softPenalty");
  });
});
