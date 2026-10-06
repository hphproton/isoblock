import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { insideLength } from "../../src/core/rays";
import { box, flatScene } from "../helpers/scene";
import { expectMatchesExpected, loadExpected, loadScene } from "../helpers/fixtures";

describe("visible: fixtures", () => {
  for (const name of ["visible", "yard"]) {
    it(`matches ${name}.expected.json`, () => {
      expectMatchesExpected(runChecks(loadScene(name)), loadExpected(name), ["visible"]);
    });
  }
});

describe("visible: ray test", () => {
  const unit = { u0: 1, v0: 1, h0: 1, u1: 2, v1: 2, h1: 2 };

  it("measures the length inside a box", () => {
    expect(insideLength([0, 0, 0], [1, 1, 1], unit)).toBeCloseTo(Math.sqrt(3), 9);
  });

  it("ignores a box behind the ray start", () => {
    expect(insideLength([3, 3, 3], [1, 1, 1], unit)).toBe(0);
  });

  it("does not count touching a face, an edge or a corner", () => {
    expect(insideLength([1, 0, 1.5], [0, 1, 0], { ...unit, u0: 1, u1: 2 })).toBe(0); // on the u = 1 plane
    expect(insideLength([0, 0, 0], [1, 1, 0], { ...unit, u0: 1, v0: 0, u1: 2, v1: 1, h0: 0, h1: 1 })).toBe(0); // grazes an edge
    expect(insideLength([0, 0, 0], [1, 1, 1], { u0: 1, v0: 1, h0: 1, u1: 2, v1: 2, h1: 2 }) > 0).toBe(true);
    expect(insideLength([0, 2, 0], [1, -1, 1], unit)).toBe(0); // touches the corner (1,1,1)
  });

  it("handles a ray parallel to an axis", () => {
    expect(insideLength([1.5, 0, 1.5], [0, 1, 0], unit)).toBeCloseTo(1, 9);
    expect(insideLength([2.5, 0, 1.5], [0, 1, 0], unit)).toBe(0);
  });
});

describe("visible: edge cases", () => {
  // camera direction is c = (0, 1, 1): rays move toward +v and up
  const run = (objects: unknown[], extra: Record<string, unknown> = {}) =>
    runChecks(
      flatScene({
        types: {
          t: { size: [1, 1, 1] },
          wall: { size: [1, 1, 2] },
          low: { size: [1, 1, 1.2] },
        },
        objects,
        checks: [{ id: "c", check: "visible", target: "t", maxOccluded: 0.1, ...extra }],
      }),
    )[0]!;

  it("is fully visible with nothing in front", () => {
    const r = run([box("t", [0, 0], "t"), box("behind", [0, -3], "wall")]);
    expect(r.value).toBe(0);
    expect(r.status).toBe("pass");
    expect(r.occluders).toEqual([]);
    expect(r.ids).toEqual(["t"]);
    expect(r.threshold).toBe(0.1);
  });

  it("counts the top face and the visible side face (hand-computed 96/128)", () => {
    const r = run([box("t", [0, 0], "t"), box("b", [0, 1.5], "wall")]);
    expect(r.value).toBeCloseTo(0.75, 9);
    expect(r.status).toBe("fail");
    expect(r.occluders).toEqual(["b"]);
  });

  it("samples side faces only from `from` times the height (hand-computed 24/128 and 48/128)", () => {
    const objects = [box("t", [0, 0], "t"), box("b", [0, 1.5], "low")];
    expect(run(objects, { from: 0.55 }).value).toBeCloseTo(0.1875, 9);
    expect(run(objects, { from: 0 }).value).toBeCloseTo(0.375, 9);
  });

  it("defaults `from` to 0.55", () => {
    const objects = [box("t", [0, 0], "t"), box("b", [0, 1.5], "low")];
    expect(run(objects).value).toBeCloseTo(0.1875, 9);
  });

  it("counts an object flush against the target face and ignores one beside it", () => {
    const r = run([box("t", [0, 0], "t"), box("flush", [0, 1], "low")]);
    expect(r.occluders).toEqual(["flush"]);
    const side = run([box("t", [0, 0], "t"), box("next", [1, 0], "wall")]);
    expect(side.value).toBe(0);
  });

  it("passes at exactly the threshold", () => {
    const objects = [box("t", [0, 0], "t"), box("b", [0, 1.5], "low")];
    expect(run(objects, { maxOccluded: 0.1875 }).status).toBe("pass");
    expect(run(objects, { maxOccluded: 0.18 }).status).toBe("fail");
  });

  it("lists occluders in object order", () => {
    const r = run([box("z", [0, 1.5], "wall"), box("t", [0, 0], "t"), box("a", [0, 1.2], "wall")]);
    expect(r.occluders).toEqual(["z", "a"]);
  });
});
