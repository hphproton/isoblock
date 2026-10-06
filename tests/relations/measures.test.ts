import { describe, expect, it } from "vitest";
import { evaluateRelations, type RelationResult } from "../../src/core/relations/evaluate";
import { validateScene } from "../../src/core/validate";
import { box, flatScene, makeScene } from "../helpers/scene";

/**
 * The flat test camera has screen x = 10u and camera direction c = (0, 1, 1), so screen-x
 * separation is measured along u and ground depth along v.
 */
function results(objects: unknown[], relations: unknown[], extra: Record<string, unknown> = {}): readonly RelationResult[] {
  const scene = validateScene(
    flatScene({
      types: { box: { size: [1, 1, 1] }, long: { size: [2, 0.5, 1] } },
      objects,
      relations,
      ...extra,
    }),
  );
  return evaluateRelations(scene).results;
}

function one(objects: unknown[], relation: Record<string, unknown>, extra: Record<string, unknown> = {}): RelationResult {
  return results(objects, [{ id: "r", hard: false, ...relation }], extra)[0] as RelationResult;
}

const ab = [box("a", [0, 0]), box("b", [3, 0])];

describe("left_of, right_of, in_front_of, behind", () => {
  it("measures the screen-x separation of the two footprints", () => {
    expect(one(ab, { a: "a", rel: "left_of", b: "b" })).toMatchObject({ status: "satisfied", violation: 0 });
    expect(one(ab, { a: "a", rel: "left_of", b: "b", gap: [0.5, 1.5] })).toMatchObject({ status: "violated", violation: 0.5 });
    expect(one(ab, { a: "a", rel: "right_of", b: "b" })).toMatchObject({ status: "violated", violation: 4 });
  });

  it("uses the footprint after rotation", () => {
    const objects = [box("a", [0, 0], "long", 90), box("b", [1, 0])];
    expect(one(objects, { a: "a", rel: "left_of", b: "b", gap: [1, 2] }).violation).toBeCloseTo(0.5, 9);
  });

  it("measures the ground-depth separation", () => {
    const objects = [box("a", [0, 3]), box("b", [0, 0])];
    expect(one(objects, { a: "a", rel: "in_front_of", b: "b", gap: [0, 1.5] })).toMatchObject({ status: "violated", violation: 0.5 });
    expect(one(objects, { a: "a", rel: "behind", b: "b" })).toMatchObject({ status: "violated", violation: 4 });
  });

  it("measures depth along c = (1, 1, 1) for a true isometric camera", () => {
    const scene = validateScene(
      makeScene({ objects: [box("a", [1, 1]), box("b", [0, 0])], relations: [{ id: "r", a: "a", rel: "in_front_of", b: "b", gap: [1, 2] }] }),
    );
    // min depth of a = 2 / sqrt(2), max depth of b = 2 / sqrt(2): separation 0, violation 1.
    expect(evaluateRelations(scene).results[0]?.violation).toBeCloseTo(1, 6);
  });

  it("skips a target that is not an object", () => {
    const zone = { zones: [{ id: "z", points: [[0, 0], [1, 0], [1, 1]] }] };
    expect(one(ab, { a: "a", rel: "left_of", b: "zone:z" }, zone)).toMatchObject({ status: "skip", violation: null, ids: ["a"] });
    expect(one(ab, { a: "zone:z", rel: "behind", b: "b" }, zone)).toMatchObject({ status: "skip", ids: ["b"] });
  });
});

describe("gap and against", () => {
  it("measures gap as the clearance distance with the band [min, max]", () => {
    const objects = [box("a", [0, 0]), box("b", [2, 2])];
    expect(one(objects, { a: "a", rel: "gap", b: "b", gap: [1, 1.2] }).violation).toBeCloseTo(Math.SQRT2 - 1.2, 6);
    expect(one(objects, { a: "a", rel: "gap", b: "b" }).status).toBe("satisfied");
  });

  it("defaults against to the band [0, 0]", () => {
    const objects = [box("a", [0, 0]), box("b", [1.5, 0])];
    expect(one(objects, { a: "a", rel: "against", b: "b" })).toMatchObject({ status: "violated", violation: 0.5 });
    expect(one(objects, { a: "a", rel: "against", b: "b", gap: [0, 0.5] }).status).toBe("satisfied");
  });

  it("measures against a lane rectangle and skips other lane shapes", () => {
    const lanes = {
      lanes: [
        { id: "L", width: 1, points: [[0, 5], [10, 5]] },
        { id: "bent", width: 1, points: [[0, 5], [5, 5], [5, 9]] },
      ],
    };
    expect(one([box("a", [2, 2])], { a: "a", rel: "against", b: "lane:L" }, lanes)).toMatchObject({ violation: 1.5, ids: ["a"] });
    expect(one([box("a", [2, 2])], { a: "a", rel: "against", b: "lane:bent" }, lanes).status).toBe("skip");
  });

  it("measures against a strip edge and skips an unbounded edge", () => {
    const strips = { strips: [{ id: "s", v: [2, null] }] };
    expect(one([box("a", [0, 0])], { a: "a", rel: "against", b: "strip:s.v0" }, strips)).toMatchObject({ violation: 1 });
    expect(one([box("a", [0, 2.5])], { a: "a", rel: "against", b: "strip:s.v0" }, strips)).toMatchObject({ violation: 0.5 });
    expect(one([box("a", [0, 0])], { a: "a", rel: "against", b: "strip:s.v1" }, strips).status).toBe("skip");
  });

  it("skips against a zone", () => {
    const zone = { zones: [{ id: "z", points: [[0, 0], [1, 0], [1, 1]] }] };
    expect(one([box("a", [0, 0])], { a: "a", rel: "against", b: "zone:z" }, zone).status).toBe("skip");
  });
});

describe("inside", () => {
  const zones = {
    zones: [
      { id: "sq", points: [[0, 0], [4, 0], [4, 4], [0, 4]] },
      { id: "ell", points: [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]] },
      { id: "none" },
    ],
  };

  it("is satisfied inside and on the boundary", () => {
    expect(one([box("a", [0, 0])], { a: "a", rel: "inside", b: "zone:sq" }, zones)).toMatchObject({ status: "satisfied", violation: 0 });
    expect(one([box("a", [3, 3])], { a: "a", rel: "inside", b: "zone:sq" }, zones).violation).toBe(0);
  });

  it("takes the largest distance of a corner to the zone", () => {
    expect(one([box("a", [3.5, 3.5])], { a: "a", rel: "inside", b: "zone:sq" }, zones).violation).toBeCloseTo(Math.SQRT1_2, 6);
    expect(one([box("a", [2.5, 2.5])], { a: "a", rel: "inside", b: "zone:ell" }, zones).violation).toBeCloseTo(1.5, 6);
  });

  it("skips a zone without points, and a target that is not a zone", () => {
    expect(one([box("a", [0, 0])], { a: "a", rel: "inside", b: "zone:none" }, zones).status).toBe("skip");
    expect(one(ab, { a: "a", rel: "inside", b: "b" }).status).toBe("skip");
  });
});

describe("aligned and order_along", () => {
  it("measures the difference of the footprint centers along the axis", () => {
    const objects = [box("a", [0, 0]), box("b", [3, 0.5], "long")];
    // centers: a (0.5, 0.5), b (4, 0.75)
    expect(one(objects, { a: "a", rel: "aligned", b: "b", axis: "v" }).violation).toBeCloseTo(0.25, 9);
    expect(one(objects, { a: "a", rel: "aligned", b: "b", axis: "u" }).violation).toBeCloseTo(3.5, 9);
  });

  it("skips aligned without an axis u or v", () => {
    expect(one(ab, { a: "a", rel: "aligned", b: "b" }).status).toBe("skip");
    expect(one(ab, { a: "a", rel: "aligned", b: "b", axis: "w" }).status).toBe("skip");
  });

  it("sums the backward steps of consecutive centers", () => {
    const objects = [box("a", [0, 0]), box("b", [3, 1]), box("c", [2, 0])];
    expect(one(objects, { rel: "order_along", ids: ["a", "b", "c"] }).violation).toBe(1);
    expect(one(objects, { rel: "order_along", ids: ["a", "c", "b"] }).violation).toBe(0);
    expect(one(objects, { rel: "order_along", ids: ["b", "a"], axis: "v" }).violation).toBe(1);
    expect(one(objects, { rel: "order_along", ids: ["c", "b", "a"] }).ids).toEqual(["a", "b", "c"]);
  });

  it("skips order_along with fewer than 2 objects, a target that is not an object, or a bad axis", () => {
    const lanes = { lanes: [{ id: "L", width: 1, points: [[0, 5], [10, 5]] }] };
    expect(one(ab, { rel: "order_along", ids: ["a"] }).status).toBe("skip");
    expect(one(ab, { rel: "order_along", ids: ["a", "lane:L"] }, lanes)).toMatchObject({ status: "skip", ids: ["a"] });
    expect(one(ab, { rel: "order_along", ids: ["a", "b"], axis: "h" }).status).toBe("skip");
  });
});

describe("on_lane", () => {
  const lanes = {
    lanes: [
      { id: "L", width: 1, points: [[0, 0], [10, 0]] },
      { id: "vee", width: 0, points: [[0, 0], [2, 2], [4, 0]] },
      { id: "dot", width: 1, points: [[1, 1], [1, 1]] },
    ],
  };

  it("adds the offset beyond half the width and the length times the band violation of t", () => {
    const objects = [box("a", [4.5, 1])]; // center (5, 1.5): offset 1.5, t 0.5
    expect(one(objects, { a: "a", rel: "on_lane", b: "lane:L" }, lanes).violation).toBeCloseTo(1, 9);
    expect(one(objects, { a: "a", rel: "on_lane", b: "lane:L", t: [0, 0.4] }, lanes).violation).toBeCloseTo(2, 9);
  });

  it("takes the first nearest point along the lane when two are equally near", () => {
    const objects = [box("a", [1.5, -1.5])]; // center (2, -1), equally near both segments of the vee
    const r = one(objects, { a: "a", rel: "on_lane", b: "lane:vee", t: [0, 0.5] }, lanes);
    expect(r.violation).toBeCloseTo(1.5 * Math.SQRT2, 6);
  });

  it("skips a lane of length 0 and a target that is not a lane", () => {
    expect(one([box("a", [0, 0])], { a: "a", rel: "on_lane", b: "lane:dot" }, lanes).status).toBe("skip");
    expect(one(ab, { a: "a", rel: "on_lane", b: "b" }).status).toBe("skip");
  });
});

describe("clear_of", () => {
  it("adds the overlap to the shortfall below min", () => {
    const objects = [box("a", [0, 0]), box("b", [0.5, 0.25])];
    expect(one(objects, { a: "a", rel: "clear_of", b: "b", min: 0.3 }).violation).toBeCloseTo(0.8, 9);
    expect(one([box("a", [0, 0]), box("b", [1, 0])], { a: "a", rel: "clear_of", b: "b" }).status).toBe("satisfied");
    expect(one([box("a", [0, 0]), box("b", [1.2, 0])], { a: "a", rel: "clear_of", b: "b", min: 0.5 }).violation).toBeCloseTo(0.3, 9);
  });

  it("measures a lane rectangle with its overlap", () => {
    const lanes = { lanes: [{ id: "L", width: 0.4, points: [[0, 0.5], [10, 0.5]] }] };
    expect(one([box("a", [0, 0])], { a: "a", rel: "clear_of", b: "lane:L" }, lanes).violation).toBeCloseTo(0.4, 9);
  });

  it("skips a strip or zone target", () => {
    const strips = { strips: [{ id: "s", v: [2, 3] }] };
    expect(one([box("a", [0, 0])], { a: "a", rel: "clear_of", b: "strip:s.v0" }, strips).status).toBe("skip");
  });
});

describe("status, ids, defaults and soft penalty", () => {
  it("skips facing and keeps the objects it names", () => {
    expect(one(ab, { a: "b", rel: "facing", b: "a" })).toMatchObject({ status: "skip", violation: null, ids: ["a", "b"] });
  });

  it("skips a relation without b", () => {
    expect(one(ab, { a: "a", rel: "gap" })).toMatchObject({ status: "skip", ids: ["a"] });
  });

  it("is satisfied up to a violation of 1e-6", () => {
    const near = [box("a", [0, 0]), box("b", [0, 4e-7])];
    const far = [box("a", [0, 0]), box("b", [0, 2e-6])];
    expect(one(near, { a: "a", rel: "aligned", b: "b", axis: "v" })).toMatchObject({ status: "satisfied", violation: 0 });
    expect(one(far, { a: "a", rel: "aligned", b: "b", axis: "v" })).toMatchObject({ status: "violated", violation: 0.000002 });
  });

  it("lists ids in object order and keeps the order of the relations", () => {
    const list = results(ab, [
      { id: "x2", a: "b", rel: "left_of", b: "a" },
      { id: "x1", a: "a", rel: "gap", b: "b", hard: true },
    ]);
    expect(list.map((r) => [r.id, r.hard, r.ids])).toEqual([
      ["x2", false, ["a", "b"]],
      ["x1", true, ["a", "b"]],
    ]);
  });

  it("sums weight times violation over soft relations that are not skipped", () => {
    const scene = validateScene(
      flatScene({
        objects: ab,
        relations: [
          { id: "s1", a: "a", rel: "right_of", b: "b", weight: 2 }, // 4
          { id: "s2", a: "a", rel: "aligned", b: "b", axis: "u" }, // 3
          { id: "h1", a: "a", rel: "right_of", b: "b", hard: true }, // hard: not counted
          { id: "s3", a: "a", rel: "facing", b: "b" }, // skipped
        ],
      }),
    );
    expect(evaluateRelations(scene).softPenalty).toBeCloseTo(11, 9);
  });

  it("gives an empty report for a scene without relations", () => {
    expect(evaluateRelations(validateScene(flatScene({ objects: ab })))).toEqual({ results: [], softPenalty: 0 });
  });
});
