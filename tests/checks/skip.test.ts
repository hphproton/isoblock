import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { expectMatchesExpected, loadExpected, loadScene } from "../helpers/fixtures";

describe("catalog checks the stage does not evaluate", () => {
  it("returns skip for reachable on a scene without a walkable zone (lane fixture)", () => {
    const results = runChecks(loadScene("lane"));
    expectMatchesExpected(results, loadExpected("lane"), ["reachable"]);
    const r = results.find((x) => x.check === "reachable")!;
    expect(r.message).toMatch(/walkable/);
  });

  it("returns skip, never pass, for every check that is not implemented", () => {
    const base = loadScene("yard");
    const names = ["sort_consistency", "state_stable"];
    const scene = { ...base, checks: names.map((check, i) => ({ id: `s${i}`, check })) };
    const results = runChecks(scene);
    expect(results.map((r) => r.status)).toEqual(names.map(() => "skip"));
    for (const r of results) {
      expect(r.value).toBeNull();
      expect(r.threshold).toBeNull();
      expect(r.ids).toEqual([]);
      expect(r.message).toMatch(/not implemented/);
    }
  });

  it("keeps results in the order of the checks", () => {
    const results = runChecks(loadScene("lane"));
    expect(results.map((r) => r.id)).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7"]);
  });

  it("returns an empty list for a scene without checks", () => {
    const { checks: _checks, ...bare } = loadScene("yard");
    expect(runChecks(bare)).toEqual([]);
  });
});
