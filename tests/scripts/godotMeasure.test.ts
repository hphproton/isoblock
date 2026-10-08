import { describe, expect, it } from "vitest";
import { ACTOR_ID, actorDifferences, sceneWithActor } from "../../scripts/godot/actor";
import { measureCase } from "../../scripts/godot/compare";
import { boxDifference, clipToFrame, countDifferences, frameIds, frameLimit, paintedIds, polygonBoxes, type Box } from "../../scripts/godot/measure";
import { objectPolygons, type ObjectPolygon } from "../../scripts/godot/svgObjects";

const square = (ref: string, x0: number, y0: number, x1: number, y1: number): ObjectPolygon => ({
  ref, points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
});

describe("godot cross-check: SVG object polygons", () => {
  const svg = [
    '<svg><g><polygon data-layer="strip" data-ref="floor" points="0,0 5,0 5,5" fill="#fff"/>',
    '<polygon data-layer="object" data-ref="a&amp;b" points="1,1 3,1 3,2.5 1,2.5" fill="#fff"/>',
    '<polygon data-layer="object" data-ref="c" points="0,0 1.25,0 1.25,1" fill="#fff"/>',
    '<text data-layer="label" data-ref="c">c</text></g></svg>',
  ].join("\n");

  it("reads the object polygons in document order and unescapes ids", () => {
    expect(objectPolygons(svg)).toEqual([
      { ref: "a&b", points: [[1, 1], [3, 1], [3, 2.5], [1, 2.5]] },
      { ref: "c", points: [[0, 0], [1.25, 0], [1.25, 1]] },
    ]);
  });
});

describe("godot cross-check: boxes", () => {
  it("takes the bounds of all polygons of an object, clipped to the frame", () => {
    const boxes = polygonBoxes([square("a", -5, 2, 4, 6), square("a", 3, 1, 12, 3), square("b", 20, 20, 30, 30)], ["a", "b", "c"], 10, 10);
    expect(boxes).toEqual([[0, 1, 10, 6], null, null]);
  });

  it("clips each polygon to the frame before taking its bounds (SPEC 13.6, stage 8)", () => {
    // A triangle cut by the left edge along its slanted sides: inside the frame it spans y 2 to 6.
    const triangle: ObjectPolygon = { ref: "a", points: [[-4, 0], [4, 4], [-4, 8]] };
    expect(polygonBoxes([triangle], ["a"], 10, 10)).toEqual([[0, 2, 4, 6]]);
    // Clipping the box of the polygon instead would give [0, 0, 4, 8].
    expect(clipToFrame(triangle.points, 10, 10)).toEqual([[0, 2], [4, 4], [0, 6]]);
  });

  it("clips against every frame edge and leaves a polygon outside the frame empty", () => {
    const diamond: [number, number][] = [[5, -2], [12, 5], [5, 12], [-2, 5]];
    const clipped = clipToFrame(diamond, 10, 10);
    expect(Math.min(...clipped.map((p) => p[0]))).toBe(0);
    expect(Math.max(...clipped.map((p) => p[0]))).toBe(10);
    expect(Math.min(...clipped.map((p) => p[1]))).toBe(0);
    expect(Math.max(...clipped.map((p) => p[1]))).toBe(10);
    expect(clipToFrame(diamond, 10, 10)).toHaveLength(8);
    expect(clipToFrame([[20, 20], [30, 20], [30, 30]], 10, 10)).toEqual([]);
    expect(polygonBoxes([{ ref: "a", points: [[-3, -3], [-1, -3], [-1, 12]] }], ["a"], 10, 10)).toEqual([null]);
  });

  it("measures the largest edge difference and lets empty boxes agree", () => {
    expect(boxDifference([10, 10, 20, 20], [10.4, 9.6, 20.5, 19.9])).toBeCloseTo(0.5, 9);
    expect(boxDifference(null, null)).toBe(0);
    expect(boxDifference(null, [1, 1, 20, 20])).toBe(Infinity);
    expect(boxDifference([1, 1, 2, 2], null)).toBe(Infinity);
    // A polygon thinner than a pixel may cover no pixel center.
    expect(boxDifference(null, [1, 1, 20, 1.4])).toBe(0);
  });
});

describe("godot cross-check: painter's raster", () => {
  it("lets a later polygon take the pixels it covers", () => {
    const ids = paintedIds([square("a", 0, 0, 4, 4), square("b", 2, 2, 6, 6)], ["a", "b"], 8, 8);
    expect(ids[0]).toBe(1);
    expect(ids[3 * 8 + 3]).toBe(2);
    expect(ids[1 * 8 + 5]).toBe(0);
    expect(ids[5 * 8 + 5]).toBe(2);
  });

  it("gives a pixel center on a shared edge to exactly one polygon (top-left rule)", () => {
    // The shared edge runs through the pixel centers of row 2 (y = 2.5) and column 2 (x = 2.5).
    const rows = paintedIds([square("a", 0, 0, 5, 2.5), square("b", 0, 2.5, 5, 5)], ["a", "b"], 5, 5);
    expect([0, 1, 2, 3, 4].map((x) => rows[2 * 5 + x])).toEqual([2, 2, 2, 2, 2]);
    const columns = paintedIds([square("a", 0, 0, 2.5, 5), square("b", 2.5, 0, 5, 5)], ["a", "b"], 5, 5);
    expect([0, 1, 2, 3, 4].map((y) => columns[y * 5 + 2])).toEqual([2, 2, 2, 2, 2]);
    // Painting b first and a second must not change who owns the shared row: ownership is by rule.
    const swapped = paintedIds([square("b", 0, 2.5, 5, 5), square("a", 0, 0, 5, 2.5)], ["a", "b"], 5, 5);
    expect([0, 1, 2, 3, 4].map((x) => swapped[2 * 5 + x])).toEqual([2, 2, 2, 2, 2]);
  });

  it("handles polygons in either winding order and ignores a polygon without area", () => {
    const reversed: ObjectPolygon = { ref: "a", points: [[0, 4], [4, 4], [4, 0], [0, 0]] };
    expect(paintedIds([reversed], ["a"], 4, 4).every((v) => v === 1)).toBe(true);
    const flat: ObjectPolygon = { ref: "a", points: [[0, 0], [4, 0], [4, 0], [0, 0]] };
    expect(paintedIds([flat], ["a"], 4, 4).every((v) => v === 0)).toBe(true);
  });

  it("clips polygons to the frame", () => {
    const ids = paintedIds([square("a", -3, -3, 2, 2)], ["a"], 4, 4);
    expect(Array.from(ids)).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("godot cross-check: engine frame", () => {
  it("reads object numbers from red and green, 0 where transparent", () => {
    const rgba = new Uint8Array([0, 0, 0, 0, 0, 5, 0, 255, 1, 2, 0, 255]);
    expect(Array.from(frameIds(rgba))).toEqual([0, 5, 258]);
  });

  it("counts differing pixels and scales the limit with the frame size", () => {
    expect(countDifferences(new Uint16Array([1, 2, 3]), new Uint16Array([1, 0, 4]))).toBe(2);
    expect(frameLimit(1000, 1000)).toBe(100);
    expect(frameLimit(500, 500)).toBe(25);
  });
});

describe("godot cross-check: one case", () => {
  const svg = [
    '<polygon data-layer="object" data-ref="a" points="2,2 8,2 8,8 2,8" fill="#000"/>',
    '<polygon data-layer="object" data-ref="b" points="6,6 14,6 14,14 6,14" fill="#000"/>',
  ].join("\n");
  const ids = ["a", "b"];

  function engineFrame(width: number, height: number): Uint8Array {
    const rgba = new Uint8Array(width * height * 4);
    const painted = paintedIds(objectPolygons(svg), ids, width, height);
    painted.forEach((n, i) => {
      if (n > 0) rgba.set([n >> 8, n & 255, 0, 255], i * 4);
    });
    return rgba;
  }

  const alone: { id: string; box: Box | null }[] = [
    { id: "a", box: [2, 2, 8, 8] },
    { id: "b", box: [6, 6, 12, 12] },
  ];

  it("passes when the engine agrees with the SVG", () => {
    const m = measureCase({ svg, ids, width: 12, height: 12, alone, rgba: engineFrame(12, 12) });
    expect(m.problems).toEqual([]);
    expect(m.worstBox).toBe(0);
  });

  it("reports an object box that is more than 1 px off", () => {
    const off = [{ id: "a", box: [2, 2, 8, 8] as Box }, { id: "b", box: [6, 6, 10.5, 12] as Box }];
    const m = measureCase({ svg, ids, width: 12, height: 12, alone: off, rgba: engineFrame(12, 12) });
    expect(m.worstObject).toBe("b");
    expect(m.worstBox).toBeCloseTo(1.5, 9);
    expect(m.problems.join("\n")).toMatch(/object b alone/);
  });

  it("reports a frame that differs in too many pixels", () => {
    const rgba = engineFrame(12, 12);
    for (let i = 0; i < 12; i++) rgba.set([0, 1, 0, 255], (11 * 12 + i) * 4);
    const m = measureCase({ svg, ids, width: 12, height: 12, alone, rgba });
    expect(m.frameDifferences).toBe(12);
    expect(m.problems.join("\n")).toMatch(/12 pixels differ in the whole frame \(limit 0\)/);
  });

  it("reports a different list of objects or a frame of another size", () => {
    expect(measureCase({ svg, ids, width: 12, height: 12, alone: alone.slice(0, 1), rgba: engineFrame(12, 12) }).problems).toHaveLength(1);
    expect(measureCase({ svg, ids, width: 12, height: 12, alone, rgba: new Uint8Array(4) }).problems).toHaveLength(1);
  });
});

describe("godot cross-check: actors (SPEC 13.6)", () => {
  const scene = JSON.stringify({ schema: "isoblock/1", id: "s", types: { box: { size: [1, 1, 1] } }, objects: [{ id: "b", type: "box", pos: [0, 0] }] });

  it("adds the actor as the last object, with its own type, footprint centered on its position", () => {
    const withActor = JSON.parse(sceneWithActor(scene, [0.4, 0.4, 1.7], [2.35, 2.9]));
    expect(withActor.types[ACTOR_ID]).toEqual({ size: [0.4, 0.4, 1.7] });
    expect(withActor.objects.map((o: { id: string }) => o.id)).toEqual(["b", ACTOR_ID]);
    // 2.35 - 0.2 is 2.1500000000000004 in floating point; the file keeps the decimal.
    expect(withActor.objects[1]).toEqual({ id: ACTOR_ID, type: ACTOR_ID, pos: [2.15, 2.7] });
    expect(withActor.types.box).toEqual({ size: [1, 1, 1] });
  });

  it("refuses a scene that already has the actor's type", () => {
    const taken = JSON.stringify({ types: { [ACTOR_ID]: { size: [1, 1, 1] } }, objects: [] });
    expect(() => sceneWithActor(taken, [1, 1, 1], [0, 0])).toThrow(/already has a type/);
  });

  it("counts the actor as the object after the scene's objects", () => {
    const svg = [
      '<polygon data-layer="object" data-ref="a" points="0,0 4,0 4,4 0,4" fill="#000"/>',
      `<polygon data-layer="object" data-ref="${ACTOR_ID}" points="2,2 4,2 4,4 2,4" fill="#000"/>`,
    ].join("\n");
    const rgba = new Uint8Array(4 * 4 * 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) rgba.set([0, x >= 2 && y >= 2 ? 2 : 1, 0, 255], (y * 4 + x) * 4);
    }
    expect(actorDifferences({ svg, rgba }, ["a"], 4, 4)).toBe(0);
    rgba.set([0, 1, 0, 255], (3 * 4 + 3) * 4);
    expect(actorDifferences({ svg, rgba }, ["a"], 4, 4)).toBe(1);
  });
});
