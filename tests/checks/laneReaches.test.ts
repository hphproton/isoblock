import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { flatScene } from "../helpers/scene";
import { expectMatchesExpected, loadExpected, loadScene } from "../helpers/fixtures";

describe("lane_reaches: fixtures", () => {
  for (const name of ["lane", "yard"]) {
    it(`matches ${name}.expected.json`, () => {
      expectMatchesExpected(runChecks(loadScene(name)), loadExpected(name), ["lane_reaches"]);
    });
  }
});

describe("lane_reaches: edge cases", () => {
  // screen = (10u, 10v); frame 100 x 100; region rows 20..80
  const run = (points: number[][], edge: string, width = 2) =>
    runChecks(
      flatScene({
        frame: { w: 100, h: 100, regions: [{ id: "r", rect: [0, 20, 100, 80] }] },
        lanes: [{ id: "L", width, points }],
        checks: [{ id: "c", check: "lane_reaches", lane: "L", edge, region: "r" }],
      }),
    )[0]!;

  it("passes when the whole intersection is inside the region y range", () => {
    const r = run([[0, 5], [12, 5]], "right"); // v 4..6 -> y 40..60
    expect(r.status).toBe("pass");
    expect(r.value).toBeCloseTo(60, 6);
    expect(r.threshold).toEqual([20, 80]);
    expect(r.ids).toEqual(["L"]);
  });

  it("fails when any part of the intersection is outside the region", () => {
    const r = run([[0, 7.5], [12, 7.5]], "right"); // y 65..85
    expect(r.status).toBe("fail");
    expect(r.value).toBeCloseTo(85, 6);
  });

  it("accepts an intersection that exactly fills the region range", () => {
    const r = run([[0, 5], [12, 5]], "right", 6); // v 2..8 -> y 20..80
    expect(r.status).toBe("pass");
    expect(r.value).toBeCloseTo(80, 6);
  });

  it("returns fail with a null value when the lane stops short of the edge", () => {
    const r = run([[0, 5], [9, 5]], "right"); // u max 9 -> x 90
    expect(r.status).toBe("fail");
    expect(r.value).toBeNull();
    expect(r.message).toBe("lane does not reach edge");
  });

  it("counts a lane that touches the edge line as reaching it", () => {
    const r = run([[0, 5], [10, 5]], "right"); // u max 10 -> x 100
    expect(r.status).toBe("pass");
    expect(r.value).toBeCloseTo(60, 6);
  });

  it("evaluates the left edge", () => {
    const r = run([[0, 5], [12, 5]], "left"); // x = 0 at u = 0 end
    expect(r.status).toBe("pass");
    expect(r.value).toBeCloseTo(60, 6);
    const far = run([[3, 5], [12, 5]], "left");
    expect(far.status).toBe("fail");
    expect(far.value).toBeNull();
  });

  it("skips top and bottom edges", () => {
    for (const edge of ["top", "bottom"]) {
      const r = run([[0, 5], [12, 5]], edge);
      expect(r.status).toBe("skip");
      expect(r.value).toBeNull();
      expect(r.threshold).toBeNull();
      expect(r.ids).toEqual([]);
      expect(r.message).toContain(edge);
    }
  });

  it("skips lane shapes that the stage does not support", () => {
    const r = run([[0, 5], [3, 5], [3, 9]], "right");
    expect(r.status).toBe("skip");
  });
});
