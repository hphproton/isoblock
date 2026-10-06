import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { box, flatScene } from "../helpers/scene";
import { expectMatchesExpected, loadExpected, loadScene } from "../helpers/fixtures";

describe("lane_clear: fixtures", () => {
  for (const name of ["lane", "yard"]) {
    it(`matches ${name}.expected.json`, () => {
      expectMatchesExpected(runChecks(loadScene(name)), loadExpected(name), ["lane_clear"]);
    });
  }
});

describe("lane_clear: edge cases", () => {
  const run = (points: number[][], objects: unknown[], extra: Record<string, unknown> = {}) =>
    runChecks(
      flatScene({
        types: { box: { size: [1, 1, 1] } },
        objects,
        lanes: [{ id: "L", width: 2, points }],
        checks: [{ id: "c", check: "lane_clear", lane: "L", ...extra }],
      }),
    )[0]!;

  it("widens the lane by half its width on each side", () => {
    const lane = [[0, 5], [10, 5]]; // v range 4..6
    expect(run(lane, [box("a", [2, 3])]).status).toBe("pass"); // v 3..4 touches
    expect(run(lane, [box("a", [2, 3.5])]).ids).toEqual(["a"]);
    expect(run(lane, [box("a", [2, 5.5])]).ids).toEqual(["a"]);
    expect(run(lane, [box("a", [2, 6])]).status).toBe("pass"); // touches
  });

  it("does not extend the lane past its end points", () => {
    expect(run([[0, 5], [10, 5]], [box("a", [10, 5])]).status).toBe("pass");
  });

  it("handles a lane parallel to v and reports blockers in object order", () => {
    const objects = [box("z", [4.5, 1]), box("a", [5.5, 2]), box("far", [20, 2])];
    const r = run([[5, 0], [5, 10]], objects);
    expect(r.value).toBe(2);
    expect(r.ids).toEqual(["z", "a"]);
    expect(r.threshold).toBe(0);
  });

  it("ignores listed objects", () => {
    const r = run([[0, 5], [10, 5]], [box("a", [2, 5]), box("b", [6, 5])], { ignore: ["a"] });
    expect(r.ids).toEqual(["b"]);
  });

  it("skips lanes that are not a 2-point segment parallel to u or v", () => {
    for (const points of [[[0, 0], [5, 0], [5, 5]], [[0, 0], [3, 3]], [[1, 1], [1, 1]]]) {
      const r = run(points, [box("a", [2, 2])]);
      expect(r.status).toBe("skip");
      expect(r.value).toBeNull();
      expect(r.threshold).toBeNull();
      expect(r.ids).toEqual([]);
      expect(r.message).toMatch(/lane "L"/);
    }
  });
});
