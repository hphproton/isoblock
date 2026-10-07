import { describe, expect, it } from "vitest";
import { checkMinScreenSize } from "../../src/core/checks/minScreenSize";
import { runChecks } from "../../src/core/checks";
import type { CheckResult, MinScreenSizeCheck, Scene } from "../../src/core/types";
import { expectMatchesExpected } from "../helpers/fixtures";
import { flatScene } from "../helpers/scene";
import { loadWalk, loadWalkExpected } from "../helpers/states";

type Params = Omit<MinScreenSizeCheck, "id" | "check" | "target">;

// flatScene: screen x = 10 u, screen y = 10 v - 10 h, frame 100 px wide.
const types = {
  // One part from (0, 0, 0) to (1, 2, 3): its screen bounds run from y = -30 to y = 20.
  post: { size: [1, 2, 3] },
  // Two parts; the upper one reaches higher and the lower one deeper: y from -50 to 30.
  tower: {
    size: [1, 1, 1],
    parts: [
      { id: "base", box: [0, 2, 0, 1, 3, 1] },
      { id: "top", box: [0, 0, 4, 1, 1, 5] },
    ],
  },
};

function check(scene: Scene, params: Params, target = "p"): CheckResult {
  return checkMinScreenSize(scene, { id: "m", check: "min_screen_size", target, ...params });
}

const scene = (type: string, pos: [number, number] = [0, 0]): Scene =>
  flatScene({ types, objects: [{ id: "p", type, pos }] });

describe("min_screen_size: the walk fixture", () => {
  it("gives the min_screen_size rows of walk.expected.json", () => {
    expectMatchesExpected(runChecks(loadWalk()), loadWalkExpected(), ["min_screen_size"]);
  });
});

describe("min_screen_size: height on screen", () => {
  it("measures the screen bounds of the corners of the box", () => {
    const r = check(scene("post"), { min: 50 });
    expect([r.status, r.value, r.threshold, r.ids]).toEqual(["pass", 50, 50, ["p"]]);
  });

  it("measures the corners of every part, not of the size box", () => {
    expect(check(scene("tower"), { min: 0 }).value).toBe(80);
  });

  it("does not depend on where the object stands", () => {
    expect(check(scene("post", [3, 7]), { min: 0 }).value).toBe(50);
  });

  it("scales the height from the frame width to screenWidth", () => {
    expect(check(scene("post"), { min: 0, screenWidth: 200 }).value).toBe(100);
    expect(check(scene("post"), { min: 0, screenWidth: 50 }).value).toBe(25);
  });

  it("fails below min, with the value, and passes at min", () => {
    const low = check(scene("post"), { min: 50.5 });
    expect([low.status, low.value, low.threshold]).toEqual(["fail", 50, 50.5]);
    expect(check(scene("post"), { min: 50 }).status).toBe("pass");
  });
});
