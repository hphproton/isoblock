import { describe, expect, it } from "vitest";
import { buildDisplayList } from "../../src/core/displayList";
import { polygon, label, type DisplayItem } from "../../src/core/displayTypes";
import { pickObject } from "../../src/core/pick";
import { planCamera } from "../../src/core/planView";
import { project } from "../../src/core/projection";
import { loadScene } from "../helpers/fixtures";

const square = (ref: string, x: number, y: number, size = 10, layer: "object" | "region" = "object") =>
  polygon(layer, ref, [[x, y], [x + size, y], [x + size, y + size], [x, y + size]], { fill: "#fff" });

describe("pickObject", () => {
  it("returns the object whose polygon holds the point", () => {
    const items: DisplayItem[] = [square("a", 0, 0), square("b", 20, 0)];
    expect(pickObject(items, 5, 5, 0)).toBe("a");
    expect(pickObject(items, 25, 5, 0)).toBe("b");
  });

  it("prefers the polygon drawn last when polygons overlap", () => {
    const items: DisplayItem[] = [square("back", 0, 0, 20), square("front", 5, 5, 20)];
    expect(pickObject(items, 10, 10, 0)).toBe("front");
    expect(pickObject(items, 2, 2, 0)).toBe("back");
  });

  it("ignores regions, labels and other non-object layers", () => {
    const items: DisplayItem[] = [square("hud", 0, 0, 100, "region"), label("object", "a", "a", [5, 5])];
    expect(pickObject(items, 5, 5, 20)).toBeNull();
  });

  it("returns null when nothing is within the slop", () => {
    const items: DisplayItem[] = [square("a", 0, 0)];
    expect(pickObject(items, 30, 5, 0)).toBeNull();
    expect(pickObject(items, 30, 5, 10)).toBeNull();
  });

  it("picks the nearest object within the slop when the point is in none", () => {
    const items: DisplayItem[] = [square("a", 0, 0), square("b", 30, 0)];
    expect(pickObject(items, 14, 5, 6)).toBe("a");
    expect(pickObject(items, 26, 5, 6)).toBe("b");
    expect(pickObject(items, 20, 5, 6)).toBeNull();
  });

  it("measures the slop to the polygon edge, also at a corner", () => {
    const items: DisplayItem[] = [square("a", 0, 0)];
    expect(pickObject(items, 13, 13, 5)).toBe("a");
    expect(pickObject(items, 14, 14, 5)).toBeNull();
  });

  it("lets a point inside win over a nearer edge of another polygon", () => {
    const items: DisplayItem[] = [square("a", 0, 0, 20), square("b", 22, 0, 10)];
    expect(pickObject(items, 19, 5, 8)).toBe("a");
  });

  it("returns null for an empty list", () => {
    expect(pickObject([], 0, 0, 10)).toBeNull();
  });

  it("finds objects of a real scene in both views", () => {
    const yard = loadScene("yard");
    const iso = buildDisplayList(yard).items;
    const [x, y] = project(yard.camera, 3.4 + 0.6, 2.6 + 0.2, 0.5);
    expect(pickObject(iso, x, y, 0)).toBe("bench");
    const plan = planCamera();
    const top = buildDisplayList(yard, { camera: plan }).items;
    const [px, py] = project(plan, 3.4 + 0.6, 2.6 + 0.2, 0);
    expect(pickObject(top, px, py, 0)).toBe("bench");
  });

  it("picks the canopy through the space under it, as drawn", () => {
    const yard = loadScene("yard");
    const iso = buildDisplayList(yard).items;
    const [x, y] = project(yard.camera, 3.6, 0.8, 2.4);
    expect(pickObject(iso, x, y, 0)).toBe("tree");
  });
});
