import { describe, expect, it } from "vitest";
import type { Box } from "../../src/core/geometry";
import { drawOrder } from "../../src/core/drawOrder";
import type { Camera } from "../../src/core/types";

const iso: Camera = { angleU: 30, angleV: 150, pxPerUnit: 100, verticalScale: 1, origin: [0, 0] };
const b = (u0: number, v0: number, h0: number, u1: number, v1: number, h1: number): Box => ({ u0, v0, h0, u1, v1, h1 });

describe("drawOrder", () => {
  it("draws a box that is lower in u before the one in front of it", () => {
    expect(drawOrder([b(2, 0, 0, 3, 1, 1), b(0, 0, 0, 1, 1, 1)], iso)).toEqual([1, 0]);
  });

  it("draws a box that is lower in v before the one in front of it", () => {
    expect(drawOrder([b(0, 2, 0, 1, 3, 1), b(0, 0, 0, 1, 1, 1)], iso)).toEqual([1, 0]);
  });

  it("draws a lower box before the one stacked on it", () => {
    expect(drawOrder([b(0, 0, 1, 1, 1, 2), b(0, 0, 0, 1, 1, 1)], iso)).toEqual([1, 0]);
  });

  it("keeps a box that hovers above and behind in front of a lower one it overlaps on screen", () => {
    const canopy = b(-0.2, -0.2, 1.4, 1.4, 1.4, 2.4);
    const actorBehind = b(-1, 0.2, 0, -0.6, 0.6, 1.2);
    expect(drawOrder([canopy, actorBehind], iso)).toEqual([1, 0]);
  });

  it("does not order boxes that cannot occlude each other", () => {
    const left = b(0, 5, 0, 1, 6, 1);
    const right = b(5, 0, 0, 6, 1, 1);
    expect(drawOrder([left, right], iso)).toHaveLength(2);
  });

  it("falls back to depth for boxes that interpenetrate", () => {
    expect(drawOrder([b(0.4, 0.4, 0, 2, 2, 1), b(0, 0, 0, 1, 1, 1)], iso)).toEqual([1, 0]);
  });

  it("is deterministic and always returns a permutation, even for interlocked boxes", () => {
    const ring = [b(0, 0, 1, 1, 3, 2), b(1, 0, 0, 2, 1, 3), b(0, 2, 0, 3, 3, 1), b(0.5, 0.5, 0.5, 2.5, 2.5, 1.5)];
    const order = drawOrder(ring, iso);
    expect([...order].sort()).toEqual([0, 1, 2, 3]);
    expect(drawOrder(ring, iso)).toEqual(order);
  });

  it("returns an empty list for no boxes", () => {
    expect(drawOrder([], iso)).toEqual([]);
  });
});
