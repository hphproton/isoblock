import { describe, expect, it } from "vitest";
import { compareVariants, type Comparison } from "../../src/core/compare/compare";
import { formatCompareMarkdown, formatCompareText } from "../../src/core/compare/format";
import { loadSortCases, loadSortScene } from "../helpers/sort";

const court = loadSortScene(loadSortCases().cases[0]!);

describe("compare: sort_consistency", () => {
  const c = compareVariants(court, [{ name: "A", text: "move box u-0.4" }]);

  it("labels a row with the check id and the unit of the count", () => {
    expect(c.checks.map((k) => k.label)).toEqual(
      court.checks!.map((k) => `sort_consistency ${k.id} (objects out of order)`),
    );
  });

  it("measures the number of objects out of order, with no decimals", () => {
    const row = c.checks.find((k) => k.id === "s1")!;
    expect(row.values).toEqual([4, 3]);
    expect(row.delta).toEqual([null, -1]);
    expect(row.threshold).toBe(0);
    const text = formatCompareText(c);
    expect(text).toMatch(/^sort_consistency s1 \(objects out of order\) +4 \u2717 +3 \u2717$/m);
    expect(text).toMatch(/^sort_consistency s7 \(objects out of order\) +1 \u2717 +0$/m);
  });

  it("writes skip for a check that was skipped", () => {
    expect(formatCompareText(c)).toMatch(/^sort_consistency s6 \(objects out of order\) +skip \u2717 +skip \u2717$/m);
    expect(formatCompareMarkdown(c)).toContain("| sort_consistency s6 (objects out of order) | skip \u2717 | skip \u2717 |");
  });

  it("hides a row that passes in every column with the base value", () => {
    const table: Comparison = compareVariants(court, [{ name: "A", text: "move crate u+0.05" }]);
    expect(formatCompareText(table)).not.toContain("sort_consistency s2");
  });

  it("compares in a state: the hidden objects are left out of every column", () => {
    const closed = compareVariants(court, [{ name: "A", text: "move box u-0.4" }], "closed");
    expect(closed.state).toBe("closed");
    expect(closed.checks.find((k) => k.id === "s1")!.values).toEqual([3, 2]);
  });
});
