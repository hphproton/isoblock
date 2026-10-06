import { describe, expect, it } from "vitest";
import { buildDisplayList, createDisplayCache } from "../../src/core/displayList";
import { moveObject } from "../../src/core/edit";
import { planCamera } from "../../src/core/planView";
import type { Scene } from "../../src/core/types";
import type { Bounds } from "../../src/core/viewport";
import { dirtyRects, MAX_PARTIAL, type Painted } from "../../src/editor/dirty";
import { loadScene } from "../helpers/fixtures";
import { makeScene } from "../helpers/scene";

const NO_IDS: ReadonlySet<string> = new Set();
const OVERLAYS = { regions: true, strips: true, lanes: true, zones: true, anchors: false, labels: false };
const crowd = loadScene("crowd");
const id = "o101";

function painted(scene: Scene, over: Partial<Painted> = {}): Painted {
  const cache = createDisplayCache();
  return {
    scene,
    viewport: { scale: 0.5, tx: 10, ty: 20 },
    overlays: OVERLAYS,
    selected: id,
    highlight: NO_IDS,
    width: 500,
    height: 600,
    dpr: 1,
    items: buildDisplayList(scene, { cache }).items,
    ...over,
  };
}

function polygonBounds(p: Painted, ref: string): Bounds {
  const boxes = p.items.flatMap((i) => (i.kind === "polygon" && i.layer === "object" && i.ref === ref ? [i.bounds] : []));
  return {
    x0: Math.min(...boxes.map((b) => b[0])),
    y0: Math.min(...boxes.map((b) => b[1])),
    x1: Math.max(...boxes.map((b) => b[2])),
    y1: Math.max(...boxes.map((b) => b[3])),
  };
}

const covers = (rects: readonly Bounds[], b: Bounds) =>
  rects.some((r) => r.x0 <= b.x0 && r.y0 <= b.y0 && r.x1 >= b.x1 && r.y1 >= b.y1);

describe("dirtyRects", () => {
  const before = painted(crowd);
  const moved = moveObject(crowd, id, [3.5, 4.5]).scene;
  const after = { ...painted(moved), viewport: before.viewport };

  it("covers where the moved object was and where it is", () => {
    const rects = dirtyRects(before, after)!;
    expect(covers(rects, polygonBounds(before, id))).toBe(true);
    expect(covers(rects, polygonBounds(after, id))).toBe(true);
  });

  it("is small compared with the canvas", () => {
    const rects = dirtyRects(before, after)!;
    const area = rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0) * before.viewport.scale ** 2, 0);
    expect(area).toBeLessThan(0.1 * before.width * before.height);
  });

  it("includes room for the label and the lock icon above the object", () => {
    const rects = dirtyRects(before, after)!;
    const label = after.items.find((i) => i.kind === "label" && i.target === "object" && i.ref === id)!;
    if (label.kind !== "label") throw new Error("label expected");
    expect(rects.some((r) => r.x0 < label.x && label.x < r.x1 && r.y0 < label.y - 20 / before.viewport.scale && label.y < r.y1)).toBe(true);
  });

  it("grows the label room with the length of the id", () => {
    const widest = (name: string): number => {
      const scene = makeScene({ objects: [{ id: name, type: "box", pos: [3, 3] }] });
      const next = moveObject(scene, name, [3.5, 3.5]).scene;
      const a = painted(scene, { selected: name });
      const rects = dirtyRects(a, { ...painted(next, { selected: name }), viewport: a.viewport })!;
      return Math.max(...rects.map((r) => r.x1 - r.x0));
    };
    expect(widest("a-rather-long-object-id")).toBeGreaterThan(widest("a") + 20);
  });

  it("asks for a full repaint when nothing was painted yet", () => {
    expect(dirtyRects(null, after)).toBeUndefined();
  });

  it("asks for a full repaint when nothing changed in the scene", () => {
    expect(dirtyRects(before, before)).toBeUndefined();
  });

  it("asks for a full repaint when the view, overlays, selection, highlight or canvas changed", () => {
    expect(dirtyRects(before, { ...after, viewport: { ...before.viewport } })).toBeUndefined();
    expect(dirtyRects(before, { ...after, overlays: { ...OVERLAYS, anchors: true } })).toBeUndefined();
    expect(dirtyRects(before, { ...after, selected: "o102" })).toBeUndefined();
    expect(dirtyRects(before, { ...after, highlight: new Set(["o102"]) })).toBeUndefined();
    expect(dirtyRects(before, { ...after, width: 400 })).toBeUndefined();
    expect(dirtyRects(before, { ...after, height: 500 })).toBeUndefined();
    expect(dirtyRects(before, { ...after, dpr: 2 })).toBeUndefined();
  });

  it("asks for a full repaint when shared inputs change", () => {
    const turned = { ...moved, camera: { ...moved.camera, origin: [400, 300] as const } };
    expect(dirtyRects(before, { ...after, scene: turned })).toBeUndefined();
  });

  it("asks for a full repaint when more than a few objects changed", () => {
    let scene = crowd;
    const ids = crowd.objects.filter((o) => !(o.locks ?? []).length).slice(0, MAX_PARTIAL + 1).map((o) => o.id);
    for (const [i, other] of ids.entries()) scene = moveObject(scene, other, [20 + i, 20]).scene;
    expect(dirtyRects(before, { ...painted(scene), viewport: before.viewport })).toBeUndefined();
  });

  it("works the same in the plan view", () => {
    const plan = planCamera();
    const a = painted(crowd, { items: buildDisplayList(crowd, { camera: plan }).items });
    const b = painted(moved, { items: buildDisplayList(moved, { camera: plan }).items, viewport: a.viewport });
    const rects = dirtyRects(a, b)!;
    expect(covers(rects, polygonBounds(a, id))).toBe(true);
    expect(covers(rects, polygonBounds(b, id))).toBe(true);
  });
});
