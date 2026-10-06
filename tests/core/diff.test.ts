import { describe, expect, it } from "vitest";
import { diffReportJson, diffScenes, formatDiff } from "../../src/core/diff";
import type { Scene } from "../../src/core/types";
import { loadScene } from "../helpers/fixtures";
import { makeScene } from "../helpers/scene";

function scene(overrides: Record<string, unknown> = {}): Scene {
  return makeScene({
    types: { box: { size: [1, 1, 1] } },
    objects: [
      { id: "a", type: "box", pos: [0, 5] },
      { id: "b", type: "box", pos: [3, 5], locks: ["pos"] },
    ],
    ...overrides,
  });
}

const changes = (a: Scene, b: Scene) => diffScenes(a, b);

describe("diffScenes", () => {
  it("is empty for equal scenes, also when keys and items are in another order", () => {
    expect(changes(scene(), scene())).toEqual([]);
    const base = scene();
    const shuffled = { ...base, objects: [...base.objects].reverse(), units: { name: "u" } } as Scene;
    expect(changes(base, shuffled)).toEqual([]);
  });

  it("matches objects by id and reports one number array as one value", () => {
    const moved = scene({ objects: [{ id: "b", type: "box", pos: [3, 5], locks: ["pos"] }, { id: "a", type: "box", pos: [0.5, 5] }] });
    expect(changes(scene(), moved)).toEqual([{ op: "replace", path: "/objects/a/pos", from: [0, 5], to: [0.5, 5] }]);
  });

  it("reports an object that was added or removed as a whole", () => {
    const added = scene({ objects: [...scene().objects, { id: "c", type: "box", pos: [9, 9] }] });
    expect(changes(scene(), added)).toEqual([{ op: "add", path: "/objects/c", to: { id: "c", type: "box", pos: [9, 9] } }]);
    expect(changes(added, scene())).toEqual([{ op: "remove", path: "/objects/c", from: { id: "c", type: "box", pos: [9, 9] } }]);
  });

  it("reports keys that appear or disappear", () => {
    const withLocks = scene({ objects: [{ id: "a", type: "box", pos: [0, 5], locks: ["pos", "rot"] }, scene().objects[1]] });
    expect(changes(scene(), withLocks)).toEqual([{ op: "add", path: "/objects/a/locks", to: ["pos", "rot"] }]);
    expect(changes(withLocks, scene())).toEqual([{ op: "remove", path: "/objects/a/locks", from: ["pos", "rot"] }]);
  });

  it("treats a list of locks as one value", () => {
    const more = scene({ objects: [scene().objects[0], { id: "b", type: "box", pos: [3, 5], locks: ["pos", "rot"] }] });
    expect(changes(scene(), more)).toEqual([{ op: "replace", path: "/objects/b/locks", from: ["pos"], to: ["pos", "rot"] }]);
  });

  it("matches assumptions by path and escapes the path as RFC 6901 says", () => {
    const a = scene({ assumptions: [{ path: "/types/box/size/2", value: 1, note: "n" }] });
    const b = scene({ assumptions: [{ path: "/types/box/size/2", value: 2, note: "m" }] });
    expect(changes(a, b)).toEqual([
      { op: "replace", path: "/assumptions/~1types~1box~1size~12/note", from: "n", to: "m" },
      { op: "replace", path: "/assumptions/~1types~1box~1size~12/value", from: 1, to: 2 },
    ]);
  });

  it("matches nested lists with ids: regions, checks, parts", () => {
    const a = scene({ checks: [{ id: "k", check: "no_overlap" }] });
    const b = scene({ checks: [{ id: "k", check: "no_overlap", ids: ["a", "b"] }] });
    expect(changes(a, b)).toEqual([{ op: "add", path: "/checks/k/ids", to: ["a", "b"] }]);
    const wide = { ...scene(), frame: { ...scene().frame, regions: [{ id: "hud", rect: [0, 0, 1000, 160], blocksScene: true }, scene().frame.regions[1]] } } as Scene;
    expect(changes(scene(), wide)).toEqual([{ op: "replace", path: "/frame/regions/hud/rect", from: [0, 0, 1000, 150], to: [0, 0, 1000, 160] }]);
  });

  it("compares a list without ids as one value, and an empty list with a list of items by id", () => {
    const zero = scene({ relations: [] });
    const one = scene({ relations: [{ id: "r1", a: "a", rel: "left_of", b: "b" }] });
    expect(changes(zero, one)).toEqual([{ op: "add", path: "/relations/r1", to: { id: "r1", a: "a", rel: "left_of", b: "b" } }]);
    const zones = (points: number[][]) => scene({ zones: [{ id: "z", points }] });
    expect(changes(zones([[0, 0], [1, 0], [1, 1]]), zones([[0, 0], [1, 0], [2, 2]]))).toEqual([
      { op: "replace", path: "/zones/z/points", from: [[0, 0], [1, 0], [1, 1]], to: [[0, 0], [1, 0], [2, 2]] },
    ]);
  });

  it("falls back to one value when ids repeat", () => {
    const dup = (x: number) => scene({ relations: [{ id: "r", a: "a", rel: "left_of", b: "b" }, { id: "r", a: "a", rel: "right_of", b: "b", min: x }] });
    expect(changes(dup(1), dup(2))).toMatchObject([{ op: "replace", path: "/relations" }]);
  });

  it("sorts entries by path in code point order, with ids that need escaping", () => {
    const a = scene({ objects: [{ id: "b/c", type: "box", pos: [0, 0] }, { id: "B", type: "box", pos: [0, 0] }, { id: "a", type: "box", pos: [0, 0] }] });
    const b = scene({ objects: [{ id: "b/c", type: "box", pos: [1, 0] }, { id: "B", type: "box", pos: [1, 0] }, { id: "a", type: "box", pos: [1, 0] }] });
    expect(changes(a, b).map((c) => c.path)).toEqual(["/objects/B/pos", "/objects/a/pos", "/objects/b~1c/pos"]);
  });

  it("orders astral characters after the Basic Multilingual Plane by code point", () => {
    const ids = ["\uffee", "\u{1f600}"];
    const make = (x: number) => scene({ objects: ids.map((id) => ({ id, type: "box", pos: [x, 0] })) });
    expect(changes(make(0), make(1)).map((c) => c.path)).toEqual(ids.map((id) => `/objects/${id}/pos`));
  });

  it("reports a value that changes type as a replace", () => {
    const a = scene({ meta: { version: 1 } });
    const b = scene({ meta: [1] });
    expect(changes(a, b)).toEqual([{ op: "replace", path: "/meta", from: { version: 1 }, to: [1] }]);
  });

  it("finds the one change between yard and a moved yard", () => {
    const yard = loadScene("yard");
    const moved = { ...yard, objects: yard.objects.map((o) => (o.id === "crate2" ? { ...o, pos: [7.2, 0.5] } : o)) } as Scene;
    expect(changes(yard, moved)).toEqual([{ op: "replace", path: "/objects/crate2/pos", from: [6.8, 0.5], to: [7.2, 0.5] }]);
  });
});

describe("formatDiff and diffReportJson", () => {
  const a = scene({ id: "one" });
  const b = scene({
    id: "two",
    objects: [{ id: "b", type: "box", pos: [3, 5], locks: ["pos"] }, { id: "c", type: "box", pos: [1, 1] }],
  });

  it("prints a summary line and one line per entry with compact JSON values", () => {
    expect(formatDiff(a, b, changes(a, b))).toBe(
      [
        "diff one -> two: 3 changes",
        '~ /id "one" -> "two"',
        '- /objects/a {"id":"a","type":"box","pos":[0,5]}',
        '+ /objects/c {"id":"c","type":"box","pos":[1,1]}',
      ].join("\n"),
    );
    const c = scene({ id: "one", objects: [{ id: "a", type: "box", pos: [0, 6] }, scene().objects[1]] });
    expect(formatDiff(a, c, changes(a, c))).toBe("diff one -> one: 1 changes\n~ /objects/a/pos [0,5] -> [0,6]");
  });

  it("says 0 changes for equal scenes", () => {
    expect(formatDiff(a, a, [])).toBe("diff one -> one: 0 changes");
  });

  it("has the keys a, b and changes in --json", () => {
    const report = diffReportJson(a, b, changes(a, b));
    expect(Object.keys(report)).toEqual(["a", "b", "changes"]);
    expect([report.a, report.b]).toEqual(["one", "two"]);
  });
});
