import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { box, flatScene } from "../helpers/scene";
import { expectMatchesExpected, loadExpected, loadScene } from "../helpers/fixtures";

describe("no_overlap: fixtures", () => {
  it("matches overlap.expected.json", () => {
    expectMatchesExpected(runChecks(loadScene("overlap")), loadExpected("overlap"), ["no_overlap"]);
  });

  it("matches yard.expected.json", () => {
    expectMatchesExpected(runChecks(loadScene("yard")), loadExpected("yard"), ["no_overlap"]);
  });
});

describe("no_overlap: edge cases", () => {
  const run = (objects: unknown[], extra: Record<string, unknown> = {}) =>
    runChecks(
      flatScene({
        types: { box: { size: [1, 1, 1] } },
        objects,
        checks: [{ id: "c", check: "no_overlap", ...extra }],
      }),
    )[0]!;

  it("does not count footprints that only touch", () => {
    const r = run([box("a", [0, 0]), box("b", [1, 0]), box("c", [0, 1]), box("d", [1, 1])]);
    expect(r.status).toBe("pass");
    expect(r.pairs).toEqual([]);
  });

  it("sorts ids, each pair and the list of pairs alphabetically", () => {
    const r = run([box("z", [0, 0]), box("m", [0.5, 0]), box("b", [10, 10]), box("a", [10.5, 10])]);
    expect(r.value).toBe(2);
    expect(r.ids).toEqual(["a", "b", "m", "z"]);
    expect(r.pairs).toEqual([["a", "b"], ["m", "z"]]);
  });

  it("removes allowed pairs in either order", () => {
    const objects = [box("a", [0, 0]), box("b", [0.5, 0]), box("c", [0.2, 0.2])];
    expect(run(objects).value).toBe(3);
    const r = run(objects, { allow: [["b", "a"]] });
    expect(r.value).toBe(2);
    expect(r.pairs).toEqual([["a", "c"], ["b", "c"]]);
  });

  it("limits the check to `ids`", () => {
    const objects = [box("a", [0, 0]), box("b", [0.5, 0]), box("c", [0.2, 0.2])];
    const r = run(objects, { ids: ["a", "b"] });
    expect(r.pairs).toEqual([["a", "b"]]);
  });

  it("uses the rotated footprint", () => {
    const types = { long: { size: [4, 1, 1] }, box: { size: [1, 1, 1] } };
    const scene = (rot: number) =>
      runChecks(
        flatScene({
          types,
          objects: [box("l", [0, 0], "long", rot), box("k", [0.2, 2], "box")],
          checks: [{ id: "c", check: "no_overlap" }],
        }),
      )[0]!;
    expect(scene(0).status).toBe("pass");
    expect(scene(90).status).toBe("fail");
  });
});
