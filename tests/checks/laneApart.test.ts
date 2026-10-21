import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import type { CheckResult } from "../../src/core/types";
import { makeScene } from "../helpers/scene";

function apart(extra: Record<string, unknown>, sceneExtra: Record<string, unknown> = {}): CheckResult {
  return runChecks(
    makeScene({
      lanes: [
        { id: "a", width: 1, points: [[0, 0], [4, 0]] },
        { id: "b", width: 1, points: [[0, 2], [4, 2]] },
        { id: "cross", width: 1, points: [[2, -2], [2, 2]] },
        { id: "diag", width: 1, points: [[0, 0], [2, 2]] },
      ],
      zones: [
        { id: "near", points: [[0, 1], [1, 1], [1, 2], [0, 2]] },
        { id: "inside", points: [[1, -0.2], [2, -0.2], [2, 0.2], [1, 0.2]] },
        { id: "clock", points: [[1, 0.2], [1, -0.2], [2, -0.2], [2, 0.2]] },
        { id: "empty" },
        { id: "notch", points: [[6, 3], [10, 3], [10, 8], [9, 8], [9, 5], [6, 5]] },
      ],
      checks: [{ id: "c", check: "lane_apart", lane: "a", target: "lane:b", ...extra }],
      ...sceneExtra,
    }),
  )[0]!;
}

describe("lane_apart", () => {
  it("measures the clearance between two lane rectangles and reports no overlap", () => {
    const r = apart({});
    expect([r.status, r.value, r.threshold, r.ids, r.overlap]).toEqual(["pass", 1, 0, ["a", "b"], 0]);
    expect(Object.keys(r)).toEqual(["id", "check", "status", "value", "threshold", "ids", "overlap", "message"]);
  });

  it("fails when the distance is below min, and passes when min is 0 and the lanes only touch", () => {
    const far = apart({ min: 1.5 });
    expect([far.status, far.value, far.overlap]).toEqual(["fail", 1, 0]);
    const touch = apart({ target: "lane:b" }, {
      lanes: [
        { id: "a", width: 1, points: [[0, 0], [4, 0]] },
        { id: "b", width: 1, points: [[0, 1], [4, 1]] },
      ],
    });
    expect([touch.status, touch.value, touch.overlap]).toEqual(["pass", 0, 0]);
    expect(apart({ target: "lane:b", min: 0.1 }, {
      lanes: [
        { id: "a", width: 1, points: [[0, 0], [4, 0]] },
        { id: "b", width: 1, points: [[0, 1], [4, 1]] },
      ],
    }).status).toBe("fail");
  });

  it("reports the area where two lanes overlap and a distance of 0", () => {
    const r = apart({ target: "lane:cross" });
    expect([r.status, r.value, r.ids, r.overlap]).toEqual(["fail", 0, ["a", "cross"], 1]);
  });

  it("clips a zone to the lane, so the order of the zone's points does not change the area", () => {
    const inside = apart({ target: "zone:inside" });
    const clock = apart({ target: "zone:clock" });
    expect([inside.status, inside.value, inside.overlap]).toEqual(["fail", 0, 0.4]);
    expect(clock.overlap).toBe(inside.overlap);
  });

  it("keeps a concave zone that misses the lane at the distance of the nearest edges", () => {
    const r = apart({ target: "zone:notch", lane: "a", min: 0 }, {
      lanes: [{ id: "a", width: 1, points: [[0, 6], [8, 6]] }],
    });
    expect([r.status, r.value, r.overlap]).toEqual(["pass", 0.5, 0]);
  });

  it("skips an unsupported lane shape and a zone with fewer than 3 points, with no overlap", () => {
    const diag = apart({ lane: "diag", target: "lane:a" });
    const empty = apart({ target: "zone:empty" });
    for (const r of [diag, empty]) {
      expect(r.status).toBe("skip");
      expect(r.ids).toEqual([]);
      expect(r.value).toBeNull();
      expect(r).not.toHaveProperty("overlap");
    }
    expect(diag.message).toContain("not parallel");
    expect(empty.message).toBe('zone "empty" has 0 points; a zone needs 3 or more');
  });
});
