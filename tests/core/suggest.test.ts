import { describe, expect, it } from "vitest";
import { suggest } from "../../src/core/suggest";

describe("suggest", () => {
  const objects = ["tree", "actor", "crate1", "crate2", "bench"];

  it("picks the nearest name and the first of a tie", () => {
    expect(suggest("clearence", ["clearance", "lane_clear"])).toBe("clearance");
    expect(suggest("crate3", objects)).toBe("crate1");
    expect(suggest("infront_of", ["behind", "in_front_of", "inside"])).toBe("in_front_of");
  });

  it("suggests nothing beyond distance 2", () => {
    expect(suggest("ghost", objects)).toBeUndefined();
    expect(suggest("zeppelin", objects)).toBeUndefined();
  });
});
