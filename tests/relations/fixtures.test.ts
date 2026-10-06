import { describe, expect, it } from "vitest";
import { evaluateRelations } from "../../src/core/relations/evaluate";
import { expectMatchesRelations, loadRelationsExpected, loadRelationsScene } from "../helpers/fixtures";

describe("relation fixture (core)", () => {
  const expected = loadRelationsExpected();
  const report = evaluateRelations(loadRelationsScene());

  it("covers 22 relations of every kind", () => {
    expect(expected.results).toHaveLength(22);
    const kinds = new Set(expected.results.map((r) => r.rel));
    for (const rel of ["left_of", "right_of", "in_front_of", "behind", "gap", "against", "inside", "aligned", "facing", "on_lane", "clear_of", "order_along"]) {
      expect(kinds.has(rel), rel).toBe(true);
    }
  });

  it("gives the expected status, violation and ids for every relation", () => {
    expectMatchesRelations(report.results as unknown as Record<string, unknown>[], expected);
  });

  it("gives every result the shape { id, rel, hard, status, violation, ids, message }", () => {
    for (const r of report.results) {
      expect(Object.keys(r)).toEqual(["id", "rel", "hard", "status", "violation", "ids", "message"]);
      expect(r.message.length, r.id).toBeGreaterThan(0);
      expect(r.message.includes("\n"), r.id).toBe(false);
    }
  });

  it("sums weight times violation over soft relations that are not skipped", () => {
    const soft = expected.results.filter((r) => !r.hard && r.violation !== null);
    // r11 has weight 2; every other relation has the default weight 1.
    const sum = soft.reduce((s, r) => s + (r.violation as number) * (r.id === "r11" ? 2 : 1), 0);
    expect(report.softPenalty).toBeCloseTo(sum, 5);
  });
});
