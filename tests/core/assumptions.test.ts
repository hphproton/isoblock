import { describe, expect, it } from "vitest";
import { assumptionAt } from "../../src/core/assumptions";
import { loadScene } from "../helpers/fixtures";

describe("assumptionAt", () => {
  const crowd = loadScene("crowd");

  it("finds the assumption for a pointer", () => {
    expect(assumptionAt(crowd, "/types/post/size/2")).toMatchObject({ value: 1.5, owner: "maintainer" });
  });

  it("returns undefined for a settled number and for a scene without assumptions", () => {
    expect(assumptionAt(crowd, "/types/post/size/1")).toBeUndefined();
    const { assumptions: _a, ...bare } = crowd;
    expect(assumptionAt(bare, "/types/post/size/2")).toBeUndefined();
  });
});
