import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compareVariants, type Comparison } from "../../src/core/compare/compare";
import { formatCompareMarkdown, formatCompareText } from "../../src/core/compare/format";
import { parseScene } from "../../src/core/validate";
import { repoRoot } from "../helpers/fixtures";

const scene = parseScene(readFileSync(join(repoRoot, "tests/fixtures/measures/measures.scene.json"), "utf8"));

describe("compare: labels of the stage 9 measures", () => {
  const c = compareVariants(scene, [{ name: "A", text: "move crate u+0.2" }]);

  it("names a drawn region, a height and a lane separation", () => {
    const labels = new Map(c.checks.map((k) => [k.id, k.label]));
    expect(labels.get("foot")).toBe("in_region view (objects outside)");
    expect(labels.get("drawn")).toBe("in_region view drawn (objects outside)");
    expect(labels.get("size_bounds")).toBe("min_screen_size tower (px)");
    expect(labels.get("size_height")).toBe("min_screen_size tower height (px)");
    expect(labels.get("size_person")).toBe("min_screen_size person height (px)");
    expect(labels.get("walks_near")).toBe("lane_apart walk1\u00d7walk2 (u)");
    expect(labels.get("on_plaza")).toBe("lane_apart walk1\u00d7plaza (u)");
  });

  it("uses the same lane_apart result in a state, and drops a hidden drawn target", () => {
    const hidden = compareVariants(scene, [{ name: "A", text: "move crate u+0.2" }], "no_tower");
    const base = c.checks.find((k) => k.id === "walks_near");
    const there = hidden.checks.find((k) => k.id === "walks_near");
    expect(there?.values).toEqual(base?.values);
    expect(hidden.checks.find((k) => k.id === "size_height")?.status).toEqual(["skip", "skip"]);
    expect(hidden.checks.find((k) => k.id === "drawn")?.values).toEqual([0, 0]);
  });
});

describe("compare: cells of lane_apart", () => {
  function table(values: (number | null)[], status: ("pass" | "fail" | "skip")[]): Comparison {
    return {
      scene: "t", state: "default", unit: "u",
      variants: [{ name: "base", label: null }, { name: "A", label: "A" }],
      failing: [0, 0], locksTouched: [[], []], moved: [null, { count: 0, distance: 0 }],
      checks: [{
        id: "c", check: "lane_apart", label: "lane_apart a\u00d7b (u)", threshold: 0,
        values, status, delta: [null, values[1] === null || values[0] === null ? null : (values[1] as number) - (values[0] as number)],
      }],
    };
  }

  it("writes the distance with 2 decimals, and skip for a skipped check", () => {
    expect(formatCompareText(table([0.3, 0], ["fail", "pass"]))).toContain("0.30 \u2717  0.00");
    expect(formatCompareMarkdown(table([null, null], ["skip", "skip"]))).toContain("skip \u2717");
  });
});
