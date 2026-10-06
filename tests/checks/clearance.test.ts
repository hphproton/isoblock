import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { box, flatScene } from "../helpers/scene";
import { expectMatchesExpected, loadExpected, loadScene } from "../helpers/fixtures";

describe("clearance: fixtures", () => {
  for (const name of ["yard", "overlap"]) {
    it(`matches ${name}.expected.json`, () => {
      expectMatchesExpected(runChecks(loadScene(name)), loadExpected(name), ["clearance"]);
    });
  }
});

describe("clearance: edge cases", () => {
  const run = (b: [number, number], min: number, swap = false) =>
    runChecks(
      flatScene({
        types: { box: { size: [1, 1, 1] } },
        objects: [box("a", [0, 0]), box("b", b)],
        checks: [{ id: "c", check: "clearance", a: swap ? "b" : "a", b: swap ? "a" : "b", min }],
      }),
    )[0]!;

  it("uses the diagonal distance between nearest corners", () => {
    const r = run([4, 5], 5);
    expect(r.value).toBe(5);
    expect(r.status).toBe("pass");
    expect(r.threshold).toBe(5);
  });

  it("fails below the minimum and lists ids in object order", () => {
    const r = run([3, 0], 2.5, true);
    expect(r.value).toBe(2);
    expect(r.status).toBe("fail");
    expect(r.ids).toEqual(["a", "b"]);
  });

  it("reports 0 for touching and overlapping footprints", () => {
    expect(run([1, 0], 0).value).toBe(0);
    expect(run([1, 0], 0).status).toBe("pass");
    expect(run([0.5, 0.5], 0.1).value).toBe(0);
    expect(run([0.5, 0.5], 0.1).status).toBe("fail");
  });

  it("passes when the gap equals the minimum", () => {
    expect(run([1.3, 0], 0.3).status).toBe("pass");
  });
});
