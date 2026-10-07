import { describe, expect, it } from "vitest";
import { compareVariants, type Comparison } from "../../src/core/compare/compare";
import { formatCompareMarkdown, formatCompareText } from "../../src/core/compare/format";
import { loadWalk } from "../helpers/states";

const walk = loadWalk();

describe("compare: labels of the gameplay checks", () => {
  const c = compareVariants(walk, [{ name: "A", text: "move rock1 u+0.6" }]);

  it("labels reachable with the check id and the unit, capacity with the kind, min_screen_size with the target", () => {
    const labels = new Map(c.checks.map((k) => [k.id, k.label]));
    expect(labels.get("k1")).toBe("reachable k1 (u)");
    expect(labels.get("s2")).toBe("capacity s2 (usable seat)");
    expect(labels.get("s4")).toBe("capacity s4 (usable entry)");
    expect(labels.get("m1")).toBe("min_screen_size walker1 (px)");
    expect(labels.get("m2")).toBe("min_screen_size walker1 (px)");
  });

  it("uses the unit name of the scene", () => {
    const meters = { ...walk, units: { name: "m" } };
    expect(compareVariants(meters, [{ name: "A", text: "move rock1 u+0.6" }]).checks[0]?.label).toBe("reachable k1 (m)");
  });
});

describe("compare: cells of the gameplay checks", () => {
  /** A comparison with one row for each check of interest and the given (base, variant) values. */
  function table(rows: { check: string; id: string; values: (number | null)[]; status: ("pass" | "fail" | "skip")[] }[]): Comparison {
    return {
      scene: "t", state: "default", unit: "u",
      variants: [{ name: "base", label: null }, { name: "A", label: "A" }],
      failing: [0, 0], locksTouched: [[], []], moved: [null, { count: 0, distance: 0 }],
      checks: rows.map((r) => ({
        id: r.id, check: r.check, label: `${r.check} ${r.id}`, threshold: null,
        values: r.values, status: r.status, delta: [null, r.values[1] === null || r.values[0] === null ? null : (r.values[1] as number) - (r.values[0] as number)],
      })),
    };
  }

  const cells = (c: Comparison) => formatCompareMarkdown(c).split("\n").slice(4, -1).map((l) => l.split(" | ").slice(1).map((x) => x.replace(/ \|$/, "")));

  it("writes reachable with 2 decimals and none when there is no path", () => {
    const c = table([
      { check: "reachable", id: "r1", values: [3.8, 5], status: ["pass", "pass"] },
      { check: "reachable", id: "r2", values: [3.1, null], status: ["fail", "fail"] },
    ]);
    expect(cells(c)).toEqual([["3.80", "5.00"], ["3.10 \u2717", "none \u2717"]]);
  });

  it("writes capacity as an integer", () => {
    const c = table([{ check: "capacity", id: "s", values: [4, 7], status: ["fail", "pass"] }]);
    expect(cells(c)).toEqual([["4 \u2717", "7"]]);
  });

  it("writes min_screen_size in whole pixels, halves up", () => {
    const c = table([
      { check: "min_screen_size", id: "a", values: [126.5, 125.49], status: ["pass", "pass"] },
      { check: "min_screen_size", id: "b", values: [0.5, 241.92], status: ["pass", "fail"] },
    ]);
    expect(cells(c)).toEqual([["127", "125"], ["1", "242 \u2717"]]);
  });

  it("writes skip for a skipped check in the text format too", () => {
    const c = table([{ check: "reachable", id: "r", values: [null, null], status: ["skip", "skip"] }]);
    expect(formatCompareText(c)).toMatch(/\nreachable r +skip \u2717 {2}skip \u2717\n/);
  });
});
