import { describe, expect, it } from "vitest";
import { createDisplayCache, buildDisplayList, type DisplayPolygon } from "../../src/core/displayList";
import { moveObject } from "../../src/core/edit";
import { inverse, project } from "../../src/core/projection";
import { planCamera } from "../../src/core/planView";
import { loadScene } from "../helpers/fixtures";
import { makeScene } from "../helpers/scene";

const yard = loadScene("yard");
const crowd = loadScene("crowd");
const plan = planCamera();

function polygons(items: ReturnType<typeof buildDisplayList>["items"], layer: string, ref?: string): DisplayPolygon[] {
  return items.filter((i): i is DisplayPolygon => i.kind === "polygon" && i.layer === layer && (ref === undefined || i.ref === ref));
}

describe("display list: camera option", () => {
  const list = buildDisplayList(yard, { camera: plan });

  it("draws one top face per part and no side faces from above", () => {
    expect(polygons(list.items, "object", "tree")).toHaveLength(2);
    expect(polygons(list.items, "object", "bench")).toHaveLength(1);
  });

  it("projects footprints with the given camera", () => {
    const [bench] = polygons(list.items, "object", "bench");
    const [x, y] = project(plan, 3.4, 2.6, 0.5);
    expect(bench!.points.some((p) => Math.abs(p[0] - x) < 1e-9 && Math.abs(p[1] - y) < 1e-9)).toBe(true);
  });

  it("maps frame regions through the ground: the screen rectangle becomes a ground parallelogram", () => {
    const [view] = polygons(list.items, "region", "view");
    const [u, v] = inverse(yard.camera, 0, 150, 0);
    const [x, y] = project(plan, u, v, 0);
    expect(view!.points[0]![0]).toBeCloseTo(x, 9);
    expect(view!.points[0]![1]).toBeCloseTo(y, 9);
  });

  it("keeps the default list for the scene camera", () => {
    expect(buildDisplayList(yard, { camera: yard.camera })).toEqual(buildDisplayList(yard));
  });

  it("draws strips over the given ground extent", () => {
    const wide = buildDisplayList(yard, { camera: plan, groundExtent: [-2, -3, 40, 20] });
    const [floor] = polygons(wide.items, "strip", "floor");
    const xs = floor!.points.map((p) => p[0]);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([project(plan, -2, 0, 0)[0], project(plan, 40, 0, 0)[0]]);
  });
});

describe("display list: anchors option", () => {
  it("adds nothing by default", () => {
    expect(polygons(buildDisplayList(yard).items, "anchor")).toHaveLength(0);
  });

  it("marks every anchor of every object, rotated with the object", () => {
    const items = buildDisplayList(yard, { anchors: true }).items;
    const marks = polygons(items, "anchor");
    expect(marks.map((m) => m.ref)).toEqual(["bench"]);
    const labels = items.filter((i) => i.kind === "label" && i.target === "anchor");
    expect(labels.map((l) => (l.kind === "label" ? l.text : ""))).toEqual(["seat1"]);
  });

  it("places an anchor at its type coordinates", () => {
    const scene = makeScene({
      types: { chair: { size: [2, 1, 1], anchors: [{ id: "a", at: [0.5, 0.25, 1], kind: "seat" }] } },
      objects: [{ id: "c", type: "chair", pos: [4, 6], rot: 90 }],
    });
    const [mark] = polygons(buildDisplayList(scene, { camera: planCamera(), anchors: true }).items, "anchor");
    const [x, y] = project(planCamera(), 4 + 1 - 0.25, 6 + 0.5, 0);
    const cx = mark!.points.reduce((s, p) => s + p[0], 0) / mark!.points.length;
    const cy = mark!.points.reduce((s, p) => s + p[1], 0) / mark!.points.length;
    expect(cx).toBeCloseTo(x, 6);
    expect(cy).toBeCloseTo(y, 6);
  });
});

describe("display list: cache", () => {
  it("gives the same list with and without a cache", () => {
    expect(buildDisplayList(crowd, { cache: createDisplayCache() })).toEqual(buildDisplayList(crowd));
  });

  it("reuses the polygons of objects that did not change", () => {
    const cache = createDisplayCache();
    const before = buildDisplayList(crowd, { cache });
    const next = moveObject(crowd, "o150", [3.5, 3.5]).scene;
    const after = buildDisplayList(next, { cache });
    const beforeSet = new Set(before.items);
    const reused = after.items.filter((i) => beforeSet.has(i)).length;
    const fresh = after.items.length - reused;
    expect(fresh).toBeLessThanOrEqual(8);
    expect(after).toEqual(buildDisplayList(next));
  });

  it("recomputes after a camera change or an edit of a type", () => {
    const cache = createDisplayCache();
    buildDisplayList(crowd, { cache });
    const turned = { ...crowd, camera: { ...crowd.camera, angleU: 20 } };
    expect(buildDisplayList(turned, { cache })).toEqual(buildDisplayList(turned));
    const taller = { ...crowd, types: { ...crowd.types, box: { ...crowd.types.box!, size: [0.5, 0.5, 2] as const } } };
    expect(buildDisplayList(taller, { cache })).toEqual(buildDisplayList(taller));
  });

  it("builds a list for a scene that lost objects, from the same cache", () => {
    const cache = createDisplayCache();
    buildDisplayList(crowd, { cache });
    const fewer = { ...crowd, objects: crowd.objects.slice(0, 10) };
    expect(buildDisplayList(fewer, { cache })).toEqual(buildDisplayList(fewer));
  });
});
