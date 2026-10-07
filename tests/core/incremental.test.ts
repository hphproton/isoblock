import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { moveObject, setRotation, setTypeSize } from "../../src/core/edit";
import { changedObjects, involves, updateResults } from "../../src/core/incremental";
import type { Scene } from "../../src/core/types";
import { fixtureNames, loadScene } from "../helpers/fixtures";
import { loadWalk } from "../helpers/states";
import { box, makeScene } from "../helpers/scene";

const yard = loadScene("yard");
const crowd = loadScene("crowd");

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("changedObjects", () => {
  it("is empty for the same scene", () => {
    expect([...(changedObjects(yard, yard) as Set<string>)]).toEqual([]);
  });

  it("names the objects whose data changed", () => {
    const next = moveObject(yard, "actor", [1, 1]).scene;
    expect([...(changedObjects(yard, next) as Set<string>)]).toEqual(["actor"]);
  });

  it("names every object of a type whose definition changed", () => {
    const next = setTypeSize(yard, "crate", 2, 0.9).scene;
    expect([...(changedObjects(yard, next) as Set<string>)].sort()).toEqual(["crate1", "crate2"]);
  });

  it("names added and removed objects", () => {
    const removed = { ...yard, objects: yard.objects.filter((o) => o.id !== "bench") };
    expect([...(changedObjects(yard, removed) as Set<string>)]).toEqual(["bench"]);
    expect([...(changedObjects(removed, yard) as Set<string>)]).toEqual(["bench"]);
  });

  it("returns all when the camera, frame, strips, lanes or checks change", () => {
    expect(changedObjects(yard, { ...yard, camera: { ...yard.camera, pxPerUnit: 70 } })).toBe("all");
    expect(changedObjects(yard, { ...yard, frame: { ...yard.frame } })).toBe("all");
    expect(changedObjects(yard, { ...yard, strips: [...(yard.strips ?? [])] })).toBe("all");
    expect(changedObjects(yard, { ...yard, lanes: [...(yard.lanes ?? [])] })).toBe("all");
    expect(changedObjects(yard, { ...yard, checks: [...(yard.checks ?? [])] })).toBe("all");
  });
});

describe("involves", () => {
  const only = (...ids: string[]) => new Set(ids);

  it("treats checks without ids as involving every object", () => {
    expect(involves({ id: "x", check: "in_region", region: "view" }, only("c"))).toBe(true);
    expect(involves({ id: "x", check: "no_overlap" }, only("c"))).toBe(true);
    expect(involves({ id: "x", check: "no_overlap" }, only())).toBe(false);
  });

  it("limits checks with ids to those objects", () => {
    expect(involves({ id: "x", check: "no_overlap", ids: ["a", "b"] }, only("c"))).toBe(false);
    expect(involves({ id: "x", check: "in_region", region: "view", ids: ["a"] }, only("a"))).toBe(true);
  });

  it("limits clearance to its two objects", () => {
    const spec = { id: "x", check: "clearance", a: "a", b: "b", min: 1 } as const;
    expect(involves(spec, only("b"))).toBe(true);
    expect(involves(spec, only("c"))).toBe(false);
  });

  it("lets every object not in `ignore` block a lane", () => {
    const spec = { id: "x", check: "lane_clear", lane: "l", ignore: ["a"] } as const;
    expect(involves(spec, only("a"))).toBe(false);
    expect(involves(spec, only("b"))).toBe(true);
  });

  it("never re-runs lane_reaches or unimplemented checks for object changes", () => {
    expect(involves({ id: "x", check: "lane_reaches", lane: "l", edge: "right", region: "view" }, only("a"))).toBe(false);
    expect(involves({ id: "x", check: "sort_consistency" }, only("a"))).toBe(false);
  });

  it("re-runs reachable and capacity for any changed object, and min_screen_size for its target", () => {
    expect(involves({ id: "x", check: "reachable", from: [0, 0], to: [1, 1] }, only("c"))).toBe(true);
    expect(involves({ id: "x", check: "capacity", kind: "seat", min: 1 }, only("c"))).toBe(true);
    expect(involves({ id: "x", check: "min_screen_size", target: "a", min: 10 }, only("a"))).toBe(true);
    expect(involves({ id: "x", check: "min_screen_size", target: "a", min: 10 }, only("c"))).toBe(false);
  });

  it("re-runs visible for any changed object", () => {
    expect(involves({ id: "x", check: "visible", target: "a", maxOccluded: 0 }, only("c"))).toBe(true);
  });
});

describe("updateResults", () => {
  const before = runChecks(yard);

  it("re-runs only the checks that involve the moved object", () => {
    const next = moveObject(yard, "actor", [2.5, 1]).scene;
    const update = updateResults(yard, next, before);
    expect(update.rerun).toEqual(["c1", "c3", "c6", "c8", "c9"]);
    expect(update.results).toEqual(runChecks(next));
  });

  it("re-runs clearance only for the two objects it names", () => {
    const next = moveObject(yard, "crate2", [7.5, 0.5]).scene;
    const update = updateResults(yard, next, before);
    expect(update.rerun).toContain("c4");
    expect(update.rerun).not.toContain("c5");
    expect(update.results).toEqual(runChecks(next));
  });

  it("reuses the result objects of checks that did not run, and of re-runs that gave the same result", () => {
    const next = moveObject(yard, "actor", [2.4, 0.97]).scene;
    const update = updateResults(yard, next, before);
    expect(update.results[3]).toBe(before[3]);
    expect(update.results[6]).toBe(before[6]);
    expect(update.results[0]).toBe(before[0]);
  });

  it("returns the previous results when nothing changed", () => {
    const update = updateResults(yard, yard, before);
    expect(update.rerun).toEqual([]);
    expect(update.results).toEqual(before);
  });

  it("runs every check when the camera changes", () => {
    const next = { ...yard, camera: { ...yard.camera, origin: [310, 300] as const } } as Scene;
    const update = updateResults(yard, next, before);
    expect(update.rerun).toEqual(before.map((r) => r.id));
    expect(update.results).toEqual(runChecks(next));
  });

  it("runs every check when the previous results do not match the check list", () => {
    const update = updateResults(yard, moveObject(yard, "actor", [2, 1]).scene, before.slice(1));
    expect(update.rerun).toHaveLength(before.length);
  });

  it("re-runs three of the four checks of crowd when one object far from o001 moves", () => {
    const base = runChecks(crowd);
    const next = moveObject(crowd, "o150", [3.5, 3.5]).scene;
    const update = updateResults(crowd, next, base);
    expect(update.rerun).toEqual(["c1", "c2", "c3"]);
    expect(update.results).toEqual(runChecks(next));
  });

  for (const name of fixtureNames()) {
    it(`gives the same results as a full run after 25 random edits of ${name}`, () => {
      const random = lcg(7);
      let scene = loadScene(name);
      let results = runChecks(scene);
      for (let step = 0; step < 25; step++) {
        const o = scene.objects[Math.floor(random() * scene.objects.length)]!;
        const pick = random();
        const next =
          pick < 0.7
            ? moveObject(scene, o.id, [Math.round(random() * 400) / 20, Math.round(random() * 200) / 20]).scene
            : pick < 0.85
              ? setRotation(scene, o.id, ([0, 90, 180, 270] as const)[Math.floor(random() * 4)]!).scene
              : setTypeSize(scene, o.type, 2, Math.round(random() * 40) / 10).scene;
        const update = updateResults(scene, next, results);
        expect(update.results, `${name} step ${step}`).toEqual(runChecks(next));
        scene = next;
        results = update.results;
      }
    });
  }
});

describe("updateResults: per-object updates of in_region and no_overlap", () => {
  const scene = makeScene({
    strips: [{ id: "band", v: [0, 6] }],
    types: { box: { size: [1, 1, 1] }, slab: { size: [2, 0.5, 0.5] } },
    objects: [
      box("a", [0, 0]),
      box("b", [0.5, 0.5]),
      box("c", [4, 4]),
      box("d", [6, 1], "slab"),
      box("e", [6.5, 1.2], "slab"),
      box("f", [9, 8]),
      box("g", [12, 2]),
    ],
    checks: [
      { id: "r1", check: "in_region", region: "view" },
      { id: "r2", check: "in_region", region: "view", strip: "band", ids: ["a", "c", "f", "g"] },
      { id: "o1", check: "no_overlap" },
      { id: "o2", check: "no_overlap", ids: ["a", "b", "d", "e"] },
      { id: "o3", check: "no_overlap", allow: [["e", "d"]] },
    ],
  });

  it("matches a full run after 60 random moves, rotations, removals and additions", () => {
    const random = lcg(42);
    let current = scene;
    let results = runChecks(current);
    for (let step = 0; step < 60; step++) {
      const ids = current.objects.map((o) => o.id);
      const pick = random();
      let next: Scene;
      if (pick < 0.7 || ids.length < 4) {
        const id = ids[Math.floor(random() * ids.length)]!;
        next = moveObject(current, id, [Math.round(random() * 130) / 10, Math.round(random() * 100) / 10]).scene;
      } else if (pick < 0.8) {
        const id = ids[Math.floor(random() * ids.length)]!;
        next = setRotation(current, id, ([0, 90, 180, 270] as const)[Math.floor(random() * 4)]!).scene;
      } else if (pick < 0.9) {
        next = { ...current, objects: current.objects.filter((o) => o.id !== ids[Math.floor(random() * ids.length)]) };
      } else {
        const id = ["a", "b", "d", "e", "x", "y"][Math.floor(random() * 6)]!;
        next = current.objects.some((o) => o.id === id)
          ? current
          : { ...current, objects: [...current.objects, box(id, [Math.round(random() * 100) / 10, Math.round(random() * 60) / 10]) as never] };
      }
      const update = updateResults(current, next, results);
      expect(update.results, `step ${step}`).toEqual(runChecks(next));
      current = next;
      results = update.results;
    }
  });

  it("keeps a result that did not change as the same object", () => {
    const before = runChecks(scene);
    const next = moveObject(scene, "g", [12.5, 2]).scene;
    const update = updateResults(scene, next, before);
    expect(update.rerun).toEqual(["r1", "r2", "o1", "o3"]);
    expect(update.results[2]).toBe(before[2]);
  });
});

describe("updateResults: the gameplay checks", () => {
  const walk = loadWalk();
  const before = runChecks(walk);

  it("re-runs reachable, capacity and visible for any moved object, and min_screen_size only for its target", () => {
    const next = moveObject(walk, "rock1", [8.6, 1.6]).scene;
    const update = updateResults(walk, next, before);
    expect(update.rerun).toEqual(["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "s1", "s2", "s3", "s4", "v1", "c1", "o1"]);
    expect(update.results).toEqual(runChecks(next));
    const walker = moveObject(walk, "walker1", [3.5, 3]).scene;
    expect(updateResults(walk, walker, before).rerun).toContain("m1");
    expect(updateResults(walk, next, before).rerun).not.toContain("m1");
  });

  it("gives the results of a full run after a move that opens a path", () => {
    const next = moveObject(walk, "barrier1", [5, 7.5]).scene;
    const update = updateResults(walk, next, before);
    expect(update.results).toEqual(runChecks(next));
    expect(update.results.find((r) => r.id === "k2")?.status).toBe("pass");
  });

  it("treats a change of the zones as a change of everything", () => {
    const next = { ...walk, zones: (walk.zones ?? []).slice(0, 1) };
    expect(changedObjects(walk, next)).toBe("all");
    expect(updateResults(walk, next, before).results).toEqual(runChecks(next));
  });
});
