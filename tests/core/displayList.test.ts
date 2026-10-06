import { describe, expect, it } from "vitest";
import { buildDisplayList, type DisplayItem } from "../../src/core/displayList";
import { project } from "../../src/core/projection";
import { loadScene } from "../helpers/fixtures";
import { makeScene } from "../helpers/scene";

const yard = loadScene("yard");

function indexOfFirst(items: readonly DisplayItem[], pred: (i: DisplayItem) => boolean): number {
  return items.findIndex(pred);
}

function polygonsOf(items: readonly DisplayItem[], ref: string) {
  return items.filter((i) => i.kind === "polygon" && i.layer === "object" && i.ref === ref);
}

describe("display list", () => {
  const list = buildDisplayList(yard);

  it("carries the frame size", () => {
    expect(list.width).toBe(1000);
    expect(list.height).toBe(1000);
  });

  it("starts with the frame background and ends with labels", () => {
    expect(list.items[0]).toMatchObject({ kind: "polygon", layer: "frame" });
    expect(list.items[list.items.length - 1]).toMatchObject({ kind: "label" });
  });

  it("draws ground first, then objects, then regions and labels", () => {
    const rank: Record<string, number> = { frame: 0, strip: 1, zone: 2, lane: 3, object: 4, region: 5, label: 6 };
    const ranks = list.items.map((i) => rank[i.layer] as number);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it("draws every object, three faces per box part", () => {
    expect(polygonsOf(list.items, "tree")).toHaveLength(6);
    for (const id of ["actor", "crate1", "crate2", "bench"]) expect(polygonsOf(list.items, id)).toHaveLength(3);
  });

  it("draws the actor and the trunk before the canopy that hides the actor", () => {
    const tree = polygonsOf(list.items, "tree");
    const firstCanopy = indexOfFirst(list.items, (i) => i === tree[3]);
    const lastActor = list.items.lastIndexOf(polygonsOf(list.items, "actor")[2] as DisplayItem);
    const lastTrunk = list.items.lastIndexOf(tree[2] as DisplayItem);
    expect(lastActor).toBeLessThan(firstCanopy);
    expect(lastTrunk).toBeLessThan(firstCanopy);
  });

  it("draws the bench, which is in front of the tree, after it", () => {
    const lastTree = list.items.lastIndexOf(polygonsOf(list.items, "tree")[5] as DisplayItem);
    const firstBench = indexOfFirst(list.items, (i) => i === polygonsOf(list.items, "bench")[0]);
    expect(firstBench).toBeGreaterThan(lastTree);
  });

  it("projects box corners with the scene camera", () => {
    const xs = polygonsOf(list.items, "crate1").flatMap((p) => (p.kind === "polygon" ? p.points : []));
    const [x, y] = project(yard.camera, 6.6, 1.1, 0); // nearest bottom corner of crate1
    expect(xs.some((q) => Math.abs(q[0] - x) < 1e-9 && Math.abs(q[1] - y) < 1e-9)).toBe(true);
  });

  it("emits an outline for every region and marks the blocking one", () => {
    const regions = list.items.filter((i) => i.kind === "polygon" && i.layer === "region");
    expect(regions.map((r) => r.ref)).toEqual(["hud", "view"]);
  });

  it("draws strips and lanes on the ground", () => {
    const refs = (layer: string) => list.items.filter((i) => i.kind === "polygon" && i.layer === layer).map((i) => i.ref);
    expect(refs("strip")).toEqual(["back", "floor"]);
    expect(refs("lane")).toEqual(["path", "haul"]);
  });

  it("is deterministic", () => {
    expect(buildDisplayList(yard)).toEqual(list);
  });

  it("labels every object once", () => {
    const labels = list.items.flatMap((i) => (i.kind === "label" && i.target === "object" ? [i.text] : []));
    expect(labels).toEqual(["tree", "actor", "crate1", "crate2", "bench"]);
  });

  it("builds a list for a scene with no objects", () => {
    const empty = buildDisplayList(makeScene());
    expect(empty.items.some((i) => i.layer === "object")).toBe(false);
  });

  it("draws zones and lane polylines", () => {
    const scene = makeScene({
      zones: [{ id: "z", kind: "walkable", points: [[0, 0], [2, 0], [2, 2]] }],
      lanes: [{ id: "bend", width: 1, points: [[0, 0], [4, 0], [4, 4]] }],
    });
    const items = buildDisplayList(scene).items;
    expect(items.filter((i) => i.kind === "polygon" && i.layer === "zone")).toHaveLength(1);
    expect(items.filter((i) => i.kind === "polygon" && i.layer === "lane")).toHaveLength(2);
  });
});
