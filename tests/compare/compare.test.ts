import { describe, expect, it } from "vitest";
import { compareVariants } from "../../src/core/compare/compare";
import { compareJson, formatCompareMarkdown, formatCompareText } from "../../src/core/compare/format";
import { serializeScene } from "../../src/core/serialize";
import type { Scene } from "../../src/core/types";
import { makeScene } from "../helpers/scene";

function base(overrides: Record<string, unknown> = {}): Scene {
  return makeScene({
    types: { box: { size: [1, 1, 1] } },
    objects: [
      { id: "a", type: "box", pos: [0, 5], locks: ["pos"] },
      { id: "b", type: "box", pos: [1.5, 5] },
      { id: "c", type: "box", pos: [5, 5], locks: ["rot"] },
    ],
    lanes: [{ id: "L", width: 0.5, points: [[0, 0], [1, 0]] }],
    checks: [
      { id: "k1", check: "clearance", a: "b", b: "a", min: 1 },
      { id: "k2", check: "no_overlap" },
      { id: "k3", check: "lane_reaches", lane: "L", edge: "right", region: "view" },
      { id: "k4", check: "sort_consistency" },
    ],
    ...overrides,
  });
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as { code: string }).code;
  }
  return "none";
}

describe("compareVariants: measures", () => {
  const c = compareVariants(base(), [
    { name: "P", text: "# push b away\nmove b u+1" },
    { name: "Q", text: "move a u+2\nmove b u+1.5 v+1" },
  ]);

  it("names the columns, base first, and uses the first comment line as the label", () => {
    expect(c.variants).toEqual([{ name: "base", label: null }, { name: "P", label: "push b away" }, { name: "Q", label: "Q" }]);
    expect(c.scene).toBe("synthetic");
    expect(c.state).toBe("default");
  });

  it("counts failing checks, skipped ones included", () => {
    // base: clearance, lane_reaches, sort_consistency (skip). P: the clearance passes.
    // Q leaves a and b touching at a corner (gap 0), so its clearance fails.
    expect(c.failing).toEqual([3, 2, 3]);
  });

  it("records the locks a variant touches without stopping it", () => {
    expect(c.locksTouched).toEqual([[], [], ["a.pos"]]);
  });

  it("measures moved objects: count and the sum of ground distances", () => {
    expect(c.moved[0]).toBeNull();
    expect(c.moved[1]).toEqual({ count: 1, distance: 1 });
    // a moves 2 along u; b moves hypot(1.5, 1) = 1.802776
    expect(c.moved[2]).toEqual({ count: 2, distance: 3.802776 });
  });

  it("has one row per check of the base, with the threshold and a delta against the base", () => {
    expect(c.checks.map((k) => k.id)).toEqual(["k1", "k2", "k3", "k4"]);
    const k1 = c.checks[0];
    expect(k1?.threshold).toBe(1);
    expect(k1?.values).toEqual([0.5, 1.5, 0]);
    expect(k1?.status).toEqual(["fail", "pass", "fail"]);
    expect(k1?.delta).toEqual([null, 1, -0.5]);
  });

  it("gives a delta of null for values that are null, and never -0", () => {
    const k3 = c.checks[2];
    expect(k3?.values).toEqual([null, null, null]);
    expect(k3?.delta).toEqual([null, null, null]);
    expect(Object.is(c.checks[1]?.delta[1], 0)).toBe(true);
  });

  it("labels checks, with the ids in the order of the result", () => {
    expect(c.checks.map((k) => k.label)).toEqual([
      "clearance a\u00d7b (u)", "no_overlap (pairs)", "lane_reaches L (y px)", "sort_consistency k4",
    ]);
  });
});

describe("compareVariants: every column runs the checks of the base", () => {
  it("ignores a change a variant makes to the checks", () => {
    const c = compareVariants(base(), [{ name: "X", text: '[{"op":"replace","path":"/checks/0/min","value":0.1}]' }]);
    expect(c.checks[0]?.threshold).toBe(1);
    expect(c.checks[0]?.status).toEqual(["fail", "fail"]);
    const removed = compareVariants(base(), [{ name: "X", text: '[{"op":"remove","path":"/checks/0"}]' }]);
    expect(removed.checks.map((k) => k.id)).toEqual(["k1", "k2", "k3", "k4"]);
    expect(removed.failing).toEqual([3, 3]);
  });

  it("takes a scene file as a variant", () => {
    const other = { ...base(), objects: base().objects.map((o) => (o.id === "b" ? { ...o, pos: [3, 5] } : o)) };
    const c = compareVariants(base(), [{ name: "S", text: serializeScene(other as Scene) }]);
    expect(c.variants[1]).toEqual({ name: "S", label: "S" });
    expect(c.moved[1]).toEqual({ count: 1, distance: 1.5 });
    expect(c.checks[0]?.values).toEqual([0.5, 2]);
  });

  it("records the locks a scene variant touches, including a locked object that is missing", () => {
    const other = { ...base(), objects: base().objects.filter((o) => o.id !== "c") };
    const c = compareVariants(base(), [{ name: "S", text: JSON.stringify(other) }]);
    expect(c.locksTouched[1]).toEqual(["c.rot"]);
    expect(c.moved[1]).toEqual({ count: 0, distance: 0 });
    const moved = { ...base(), objects: base().objects.map((o) => (o.id === "a" ? { ...o, pos: [0, 6] } : o)) };
    expect(compareVariants(base(), [{ name: "S", text: JSON.stringify(moved) }]).locksTouched[1]).toEqual(["a.pos"]);
  });

  it("ignores the checks of a scene variant, and stops when its references break under the base checks", () => {
    const other = { ...base(), checks: [] };
    expect(compareVariants(base(), [{ name: "S", text: JSON.stringify(other) }]).checks).toHaveLength(4);
    const lacking = { ...base(), objects: [{ id: "b", type: "box", pos: [1.5, 5] }, { id: "c", type: "box", pos: [5, 5] }], checks: [] };
    expect(code(() => compareVariants(base(), [{ name: "S", text: JSON.stringify(lacking) }]))).toBe("E_REF");
  });
});

describe("compareVariants: errors stop the comparison (exit 2) and name the variant", () => {
  const run = (text: string) => () => compareVariants(base(), [{ name: "V", text }]);

  it("reports a malformed or failing patch, a later-stage command and a bad scene", () => {
    expect(code(run("move ghost u+1"))).toBe("E_PATCH");
    expect(code(run("[{"))).toBe("E_PATCH");
    expect(code(run("solve"))).toBe("E_USAGE");
    expect(code(run("set /objects/1/type nothing"))).toBe("E_REF");
    expect(code(run("{ nope"))).toBe("E_JSON_PARSE");
    expect(code(run('{"schema":"isoblock/1"}'))).toBe("E_SCHEMA");
    expect(run("move ghost u+1")).toThrowError(/^variant V: line 1: unknown object "ghost"/);
  });
});

describe("compare formats", () => {
  const P = { name: "P", text: "# push b away\nmove b u+1" };
  const Q = { name: "Q", text: "move a u+2" };
  const c = compareVariants(base(), [P, Q]);

  it("prints the text format with two heading lines and a table", () => {
    // Q moves a onto b: gap 0, one overlapping pair. The first column is 25 wide, plus 2.
    expect(formatCompareText(c)).toBe(
      [
        "compare synthetic \u00b7 state default \u00b7 base vs P, Q",
        "P = push b away \u00b7 Q = Q",
        "metric                     base    P         Q",
        "failing checks             3       2         4",
        "locks touched              0       0         1 \u2717 (a.pos)",
        "clearance a\u00d7b (u)          0.50 \u2717  1.50      0.00 \u2717",
        "no_overlap (pairs)         0       0         1 \u2717",
        "lane_reaches L (y px)      none \u2717  none \u2717    none \u2717",
        "sort_consistency k4        skip \u2717  skip \u2717    skip \u2717",
        "objects moved / total (u)  -       1 / 1.00  1 / 2.00",
      ].join("\n"),
    );
  });

  it("hides a check row that passes in every column with the base value", () => {
    const text = formatCompareText(compareVariants(base(), [P]));
    expect(text).not.toContain("no_overlap");
    expect(text).toContain("clearance");
    const only = compareVariants(base({ checks: [{ id: "k2", check: "no_overlap" }] }), [P]);
    expect(formatCompareText(only).split("\n")).toHaveLength(6);
  });

  it("shows a passing row whose value differs from the base", () => {
    const loose = compareVariants(base({ checks: [{ id: "k1", check: "clearance", a: "a", b: "b", min: 0.1 }] }), [P]);
    expect(formatCompareText(loose)).toMatch(/^clearance a\u00d7b \(u\) +0\.50 +1\.50$/m);
  });

  it("widens a column by code points, not by UTF-16 units, and removes trailing spaces", () => {
    const wide = compareVariants(base(), [{ name: "\u{1f600}", text: "move b u+1" }, Q]);
    const lines = formatCompareText(wide).split("\n");
    for (const line of lines) expect(line).toBe(line.trimEnd());
    // column 1 starts at 27, column 2 at 27 + 8, column 3 at 27 + 8 + 10
    expect(Array.from(lines[2] as string).indexOf("Q")).toBe(45);
  });

  it("prints the md format as a table with the same rows", () => {
    expect(formatCompareMarkdown(c).split("\n")).toEqual([
      "| metric | base | P | Q |",
      "|---|---|---|---|",
      "| failing checks | 3 | 2 | 4 |",
      "| locks touched | 0 | 0 | 1 \u2717 (a.pos) |",
      "| clearance a\u00d7b (u) | 0.50 \u2717 | 1.50 | 0.00 \u2717 |",
      "| no_overlap (pairs) | 0 | 0 | 1 \u2717 |",
      "| lane_reaches L (y px) | none \u2717 | none \u2717 | none \u2717 |",
      "| sort_consistency k4 | skip \u2717 | skip \u2717 | skip \u2717 |",
      "| objects moved / total (u) | - | 1 / 1.00 | 1 / 2.00 |",
    ]);
  });

  it("escapes a vertical bar in a Markdown cell", () => {
    const bar = compareVariants(base(), [{ name: "a|b", text: "move b u+1" }]);
    expect(formatCompareMarkdown(bar).split("\n")[0]).toBe("| metric | base | a\\|b |");
  });

  it("prints the json format with the keys of SPEC section 11.1 and no unit", () => {
    const json = compareJson(c);
    expect(Object.keys(json)).toEqual(["scene", "state", "variants", "failing", "locksTouched", "moved", "checks"]);
    expect(Object.keys(json.checks[0] as object)).toEqual(["id", "check", "label", "threshold", "values", "status", "delta"]);
  });
});
