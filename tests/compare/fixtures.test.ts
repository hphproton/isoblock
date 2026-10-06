import { describe, expect, it } from "vitest";
import { compareVariants } from "../../src/core/compare/compare";
import { compareJson, formatCompareMarkdown, formatCompareText } from "../../src/core/compare/format";
import { expectMatchesCompare, loadCompareExpected, loadScene, readCompareFile, yardVariants } from "../helpers/fixtures";

describe("compare fixtures (core)", () => {
  const comparison = compareVariants(loadScene("yard"), yardVariants());

  it("gives yard.expected.json within tolerance", () => {
    expectMatchesCompare(JSON.parse(JSON.stringify(compareJson(comparison))), loadCompareExpected());
  });

  it("gives yard.expected.txt byte for byte", () => {
    expect(`${formatCompareText(comparison)}\n`).toBe(readCompareFile("yard.expected.txt"));
  });

  it("gives yard.expected.md byte for byte", () => {
    expect(`${formatCompareMarkdown(comparison)}\n`).toBe(readCompareFile("yard.expected.md"));
  });
});
