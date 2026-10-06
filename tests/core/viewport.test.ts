import { describe, expect, it } from "vitest";
import { buildDisplayList } from "../../src/core/displayList";
import { contentGround, planCamera } from "../../src/core/planView";
import { project } from "../../src/core/projection";
import { fitViewport, fromCanvas, groundBounds, panBy, toCanvas, zoomAt } from "../../src/core/viewport";
import { footprint } from "../../src/core/geometry";
import { loadScene } from "../helpers/fixtures";
import { box, makeScene } from "../helpers/scene";

describe("viewport", () => {
  const frame = { x0: 0, y0: 0, x1: 1000, y1: 1000 };

  it("fits bounds into the canvas and centres them", () => {
    expect(fitViewport(frame, 500, 400, 0)).toEqual({ scale: 0.4, tx: 50, ty: 0 });
  });

  it("leaves a margin on every side", () => {
    const vp = fitViewport(frame, 520, 520, 10);
    expect(vp.scale).toBeCloseTo(0.5, 12);
    expect(toCanvas(vp, [0, 0])[0]).toBeCloseTo(10, 9);
    expect(toCanvas(vp, [1000, 1000])[1]).toBeCloseTo(510, 9);
  });

  it("falls back to scale 1 for empty bounds or an empty canvas", () => {
    expect(fitViewport({ x0: 3, y0: 4, x1: 3, y1: 4 }, 100, 100, 0).scale).toBe(1);
    expect(fitViewport(frame, 0, 0, 0).scale).toBe(1);
  });

  it("converts between display and canvas coordinates", () => {
    const vp = { scale: 2.5, tx: -30, ty: 12 };
    expect(toCanvas(vp, [10, 20])).toEqual([-5, 62]);
    const back = fromCanvas(vp, toCanvas(vp, [123.5, -42.25]));
    expect(back[0]).toBeCloseTo(123.5, 9);
    expect(back[1]).toBeCloseTo(-42.25, 9);
  });

  it("zooms about a canvas point, which keeps the display point under it", () => {
    const vp = { scale: 1.2, tx: 40, ty: -10 };
    const at: [number, number] = [210, 130];
    const before = fromCanvas(vp, at);
    const zoomed = zoomAt(vp, at, 1.5, { min: 0.1, max: 10 });
    const after = fromCanvas(zoomed, at);
    expect(zoomed.scale).toBeCloseTo(1.8, 12);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
  });

  it("clamps the zoom to the limits", () => {
    const vp = { scale: 1, tx: 0, ty: 0 };
    expect(zoomAt(vp, [0, 0], 1000, { min: 0.5, max: 4 }).scale).toBe(4);
    expect(zoomAt(vp, [0, 0], 0.0001, { min: 0.5, max: 4 }).scale).toBe(0.5);
  });

  it("pans by a canvas delta", () => {
    expect(panBy({ scale: 2, tx: 1, ty: 2 }, 5, -3)).toEqual({ scale: 2, tx: 6, ty: -1 });
  });
});

describe("planView", () => {
  it("is a top-down camera: u right, v down, no height", () => {
    const cam = planCamera(50);
    const [x, y] = project(cam, 2, 3, 9);
    expect(x).toBeCloseTo(100, 9);
    expect(y).toBeCloseTo(150, 9);
  });

  it("holds every object, lane and zone point in the content bounds", () => {
    const yard = loadScene("yard");
    const [u0, v0, u1, v1] = contentGround(yard);
    for (const o of yard.objects) {
      const f = footprint(yard, o);
      expect(f.u0).toBeGreaterThanOrEqual(u0);
      expect(f.v0).toBeGreaterThanOrEqual(v0);
      expect(f.u1).toBeLessThanOrEqual(u1);
      expect(f.v1).toBeLessThanOrEqual(v1);
    }
    for (const lane of yard.lanes ?? []) {
      for (const [u, v] of lane.points) {
        expect(u).toBeGreaterThanOrEqual(u0);
        expect(u).toBeLessThanOrEqual(u1);
        expect(v).toBeGreaterThanOrEqual(v0);
        expect(v).toBeLessThanOrEqual(v1);
      }
    }
  });

  it("is exact for one object", () => {
    const scene = makeScene({ objects: [box("a", [1, 2])] });
    expect(contentGround(scene)).toEqual([1, 2, 2, 3]);
  });

  it("falls back to the ground the frame shows when there is nothing to hold", () => {
    const [u0, v0, u1, v1] = contentGround(makeScene());
    expect(u1).toBeGreaterThan(u0);
    expect(v1).toBeGreaterThan(v0);
  });

  it("turns a ground rectangle into display bounds for a camera", () => {
    const cam = planCamera(40);
    const plan = groundBounds([1, 2, 3, 5], cam);
    expect([plan.x0, plan.y0, plan.x1, plan.y1].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([40, 80, 120, 200]);
    const iso = loadScene("yard").camera;
    const b = groundBounds([0, 0, 2, 2], iso);
    expect(b.x1).toBeGreaterThan(b.x0);
    expect(b.y1).toBeGreaterThan(b.y0);
  });

  it("draws the same objects in both views", () => {
    const yard = loadScene("yard");
    const refs = (camera = yard.camera) =>
      [...new Set(buildDisplayList(yard, { camera }).items.filter((i) => i.layer === "object").map((i) => i.ref))];
    expect(refs(planCamera()).sort()).toEqual(refs().sort());
  });
});
