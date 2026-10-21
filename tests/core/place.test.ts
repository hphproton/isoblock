import { describe, expect, it } from "vitest";
import { addPosition, duplicatePosition, freshId, snapHalfUp } from "../../src/core/place";
import { loadScene } from "../helpers/fixtures";

describe("snap and placement", () => {
  it("snaps halfway up, including a negative tie", () => {
    expect(snapHalfUp(1.25, 0.5)).toBe(1.5);
    expect(snapHalfUp(-1.25, 0.5)).toBe(-1);
    expect(snapHalfUp(4.881, 0.1)).toBe(4.9);
    expect(snapHalfUp(1.994, 0.1)).toBe(2);
  });

  it("places an added object of yard at the snapped center of the view", () => {
    expect(addPosition(loadScene("yard"), 0.1)).toEqual([4.9, 2]);
    expect(freshId(loadScene("yard"), "crate")).toBe("crate3");
  });

  it("places a copy one footprint along u", () => {
    expect(duplicatePosition(loadScene("yard"), "bench")).toEqual([4.6, 2.6]);
  });
});
