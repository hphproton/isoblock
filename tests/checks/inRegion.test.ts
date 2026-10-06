import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
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
});
