import { describe, expect, it } from "vitest";
import { boxOutline, convexHull, convexOverlapArea, polygonArea } from "../../src/core/sort/outline";
import { project } from "../../src/core/projection";
import type { Camera } from "../../src/core/types";

const square = (x: number, y: number, size: number): [number, number][] => [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];
const close = (a: number, b: number): void => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe("convexHull", () => {
  it("returns the corners of a square in counter-clockwise order, without inner and collinear points", () => {
    const hull = convexHull([[0, 0], [1, 1], [2, 0], [2, 2], [0, 2], [1, 0], [0, 1]]);
    expect(hull).toHaveLength(4);
    close(polygonArea(hull), 4);
  });

  it("keeps fewer than three points as they are, sorted", () => {
    expect(convexHull([[2, 2], [1, 1]])).toEqual([[1, 1], [2, 2]]);
    expect(convexHull([])).toEqual([]);
  });

  it("collapses collinear points to two", () => {
    expect(convexHull([[0, 0], [1, 1], [2, 2], [3, 3]])).toHaveLength(2);
  });
});

describe("convexOverlapArea", () => {
  const a = convexHull(square(0, 0, 2));

  it("is the area of the shared part of two squares", () => {
    close(convexOverlapArea(a, convexHull(square(1, 1, 2))), 1);
    close(convexOverlapArea(a, convexHull(square(0, 0, 2))), 4);
    close(convexOverlapArea(a, convexHull(square(0.5, 0, 1))), 1);
  });

  it("is half of a square for a square shifted by half its size", () => {
    close(convexOverlapArea(a, convexHull(square(1, 0, 2))), 2);
  });

  it("is 0 for outlines that are apart or only touch along an edge or at a corner", () => {
    expect(convexOverlapArea(a, convexHull(square(3, 0, 1)))).toBe(0);
    expect(convexOverlapArea(a, convexHull(square(2, 0, 2)))).toBe(0);
    expect(convexOverlapArea(a, convexHull(square(2, 2, 1)))).toBe(0);
  });

  it("is the whole inner outline when one is inside the other, in either order", () => {
    const inner = convexHull(square(0.5, 0.5, 1));
    close(convexOverlapArea(a, inner), 1);
    close(convexOverlapArea(inner, a), 1);
  });

  it("is 0 when an outline has no area", () => {
    expect(convexOverlapArea(a, [[0, 0], [2, 2]])).toBe(0);
    expect(convexOverlapArea(a, [])).toBe(0);
  });

  it("measures a triangle against a square", () => {
    const triangle = convexHull([[0, 0], [4, 0], [0, 4]]);
    // The square [0, 2] lies wholly under the line x + y = 4.
    close(convexOverlapArea(a, triangle), 4);
    // The square [1, 3] is cut by that line along its diagonal: half of it is left.
    close(convexOverlapArea(convexHull(square(1, 1, 2)), triangle), 2);
  });
});

describe("boxOutline", () => {
  const camera: Camera = { angleU: 30, angleV: 150, pxPerUnit: 100, verticalScale: 1, origin: [0, 0] };
  const at = (u: number, v: number, h: number) => project(camera, u, v, h);

  it("is a hexagon for a box seen from above in true isometric", () => {
    const outline = boxOutline({ u0: 0, v0: 0, h0: 0, u1: 1, v1: 1, h1: 1 }, at);
    expect(outline).toHaveLength(6);
    // Width 2 * 86.6 and height 100 + 100: the hexagon is 3/4 of its bounding box.
    close(polygonArea(outline), 0.75 * (2 * 86.60254037844386) * 200);
  });

  it("has no area for a box without thickness along u and v", () => {
    expect(polygonArea(boxOutline({ u0: 1, v0: 1, h0: 0, u1: 1, v1: 1, h1: 2 }, at))).toBe(0);
  });
});
