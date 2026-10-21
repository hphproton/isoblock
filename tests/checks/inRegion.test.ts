import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { updateResults } from "../../src/core/incremental";
import { moveObject } from "../../src/core/edit";
import { box, flatScene } from "../helpers/scene";
import { expectMatchesExpected, loadExpected, loadScene } from "../helpers/fixtures";

describe("in_region: fixtures", () => {
  for (const name of ["yard", "overlap"]) {
    it(`matches ${name}.expected.json`, () => {
      expectMatchesExpected(runChecks(loadScene(name)), loadExpected(name), ["in_region"]);
    });
  }
});

describe("in_region: edge cases", () => {
  const types = { sq: { size: [2, 2, 1] } };
  const strips = [{ id: "s", v: [0, 3] }, { id: "open", v: [null, 8] }, { id: "low", v: [4, null] }, { id: "fit", v: [1, 3] }];
  const run = (region: number[], extra: Record<string, unknown> = {}) =>
    runChecks(
      flatScene({
        types,
        strips,
        frame: { w: 100, h: 100, regions: [{ id: "r", rect: region }] },
        objects: [box("a", [1, 1], "sq"), box("b", [5, 5], "sq")],
        checks: [{ id: "c", check: "in_region", region: "r", ...extra }],
      }),
    )[0]!;

  it("treats region edges as inside", () => {
    const r = run([10, 10, 70, 70]);
    expect(r.status).toBe("pass");
    expect(r.value).toBe(0);
    expect(r.ids).toEqual([]);
  });

  it("fails an object with one corner outside and lists it in object order", () => {
    const r = run([10, 10, 69.9, 70]);
    expect(r.status).toBe("fail");
    expect(r.value).toBe(1);
    expect(r.ids).toEqual(["b"]);
    expect(r.threshold).toBe(0);
  });

  it("limits the check to `ids`", () => {
    const r = run([10, 10, 69.9, 70], { ids: ["a"] });
    expect(r.status).toBe("pass");
  });

  it("checks the footprint v range against a strip, with null as unbounded", () => {
    expect(run([0, 0, 100, 100], { strip: "s" }).ids).toEqual(["b"]);
    expect(run([0, 0, 100, 100], { strip: "open" }).status).toBe("pass");
    expect(run([0, 0, 100, 100], { strip: "low" }).ids).toEqual(["a"]);
  });

  it("accepts a footprint that exactly fills the strip", () => {
    expect(run([0, 0, 100, 100], { strip: "fit", ids: ["a"] }).status).toBe("pass");
  });

  it("does not report outside for the footprint measure", () => {
    expect(run([0, 0, 100, 100])).not.toHaveProperty("outside");
  });
});

describe("in_region: drawn boxes (SPEC 9.4)", () => {
  const types = { sq: { size: [2, 2, 0] }, post: { size: [0, 0, 0] } };
  const scene = (region: number[], extra: Record<string, unknown> = {}, objects = [box("a", [0, 0], "sq")]) =>
    flatScene({
      types,
      frame: { w: 100, h: 100, regions: [{ id: "r", rect: region }] },
      objects,
      checks: [{ id: "c", check: "in_region", region: "r", measure: "drawn", ...extra }],
    });

  it("measures the share of the drawn box outside the region, and passes when the share equals maxOutside", () => {
    // The box covers x 0..20, y 0..20. The region starts at x 10, so half of it is outside.
    const half = runChecks(scene([10, 0, 100, 100]))[0]!;
    expect([half.status, half.value, half.ids, half.outside, half.threshold]).toEqual(["fail", 1, ["a"], [0.5], 0]);
    expect(Object.keys(half)).toEqual(["id", "check", "status", "value", "threshold", "ids", "outside", "message"]);
    const allowed = runChecks(scene([10, 0, 100, 100], { maxOutside: 0.5 }))[0]!;
    expect([allowed.status, allowed.value, allowed.outside]).toEqual(["pass", 0, []]);
  });

  it("gives a drawn box with no area a share of 0 inside the region and 1 outside it", () => {
    const inside = runChecks(scene([0, 0, 100, 100], {}, [box("a", [1, 1], "post")]))[0]!;
    const outside = runChecks(scene([0, 0, 100, 100], {}, [box("a", [-1, -1], "post")]))[0]!;
    expect([inside.status, inside.outside]).toEqual(["pass", []]);
    expect([outside.status, outside.ids, outside.outside]).toEqual(["fail", ["a"], [1]]);
  });

  it("still fails the strip rule when the drawn box is inside, and keeps that share", () => {
    const strips = [{ id: "s", v: [0, 3] as [number, number] }];
    const r = runChecks(
      flatScene({
        types,
        strips,
        frame: { w: 100, h: 100, regions: [{ id: "r", rect: [0, 0, 100, 100] }] },
        objects: [box("a", [1, 8], "sq")],
        checks: [{ id: "c", check: "in_region", region: "r", strip: "s", measure: "drawn" }],
      }),
    )[0]!;
    expect([r.status, r.ids, r.outside]).toEqual(["fail", ["a"], [0]]);
  });

  it("measures only the changed objects again and matches a full run", () => {
    const start = scene([10, 0, 100, 100], {}, [box("a", [0, 0], "sq"), box("b", [8, 0], "sq")]);
    const before = runChecks(start);
    const next = moveObject(start, "a", [8, 0]).scene;
    expect(updateResults(start, next, before).results).toEqual(runChecks(next));
    expect(runChecks(next)[0]?.status).toBe("pass");
  });
});
