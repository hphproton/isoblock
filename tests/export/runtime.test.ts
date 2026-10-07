import { describe, expect, it } from "vitest";
import { runtimeFile } from "../../src/core/export/runtime";
import { buildDisplayList } from "../../src/core/displayList";
import { serializeJson } from "../../src/core/serialize";
import { expectSameJson, loadCaseScene, loadExportCases, readExportJson, withoutRules } from "../helpers/exportCases";
import { loadScene, rawFixture } from "../helpers/fixtures";
import { orderDirection } from "../../src/core/projection";
import { parseScene } from "../../src/core/validate";

const { tolerance, cases } = loadExportCases();

function runtimeOf(raw: Record<string, any>): any {
  return JSON.parse(serializeJson(runtimeFile(parseScene(JSON.stringify(raw)))));
}

describe("runtime file: every case of tests/fixtures/export/cases.json", () => {
  for (const c of cases) {
    it(`${c.name} equals ${c.runtime} (keys in order, numbers within ${tolerance.world})`, () => {
      const text = serializeJson(runtimeFile(loadCaseScene(c)));
      expectSameJson(JSON.parse(text), readExportJson(c.runtime), tolerance.world, c.name);
    });

    it(`${c.name} uses the saved format and gives the same bytes twice`, () => {
      const scene = loadCaseScene(c);
      const text = serializeJson(runtimeFile(scene));
      expect(text).toBe(serializeJson(runtimeFile(scene)));
      expect(text.endsWith("}\n")).toBe(true);
      expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
    });

    it(`${c.name}: parts carry the painter's order of the display list`, () => {
      const scene = loadCaseScene(c);
      const file = runtimeFile(scene);
      const byOrder = file.objects.flatMap((o) => o.parts.map((p) => ({ id: o.id, order: p.order }))).sort((x, y) => x.order - y.order);
      // Orders are a permutation of 0..n-1, one per part.
      expect(byOrder.map((p) => p.order)).toEqual(byOrder.map((_, i) => i));
      // The object polygons of the display list come out in that order (consecutive parts of one object merge).
      const refs = buildDisplayList(scene).items.filter((i) => i.kind === "polygon" && i.layer === "object").map((i) => i.ref);
      const merge = (xs: readonly string[]): string[] => xs.filter((x, i) => i === 0 || xs[i - 1] !== x);
      expect(merge(refs)).toEqual(merge(byOrder.map((p) => p.id)));
    });
  }
});

describe("runtime file: rules of SPEC 13.7", () => {
  const yard = loadScene("yard");

  it("has the top-level keys in order", () => {
    expect(Object.keys(runtimeFile(yard))).toEqual([
      "schema", "scene", "meta", "units", "camera", "cameraDir", "frame", "strips", "objects", "zones", "lanes",
    ]);
  });

  it("takes scene, version and status from the scene, null when there is no meta", () => {
    const file = runtimeFile(yard);
    expect(file.schema).toBe("isoblock-runtime/1");
    expect(file.scene).toBe("yard");
    expect(file.meta).toEqual({ version: 1, status: "draft" });
    const raw = rawFixture("yard");
    delete raw.meta;
    expect(runtimeOf(raw).meta).toEqual({ version: null, status: null });
    raw.meta = { status: "approved" };
    expect(runtimeOf(raw).meta).toEqual({ version: null, status: "approved" });
  });

  it("defaults verticalScale to 1, rot to 0, tags to [] and blocksScene to false", () => {
    const raw = rawFixture("yard");
    delete raw.camera.verticalScale;
    delete raw.objects[0].rot;
    delete raw.objects[0].tags;
    delete raw.frame.regions[1].blocksScene;
    const file = runtimeOf(raw);
    expect(file.camera).toEqual({ angleU: 30, angleV: 150, pxPerUnit: 80, verticalScale: 1, origin: [300, 300] });
    expect(file.objects[0].rot).toBe(0);
    expect(file.objects[0].tags).toEqual([]);
    expect(file.frame.regions).toEqual([
      { id: "hud", rect: [0, 0, 1000, 150], blocksScene: true },
      { id: "view", rect: [0, 150, 1000, 1000], blocksScene: false },
    ]);
  });

  it("writes absent lists as empty lists and copies units, strips, zones and lanes without x- keys", () => {
    const raw = withoutRules(rawFixture("yard"));
    delete raw.strips;
    delete raw.zones;
    delete raw.lanes;
    const bare = runtimeOf(raw);
    expect([bare.strips, bare.zones, bare.lanes]).toEqual([[], [], []]);
    const withX = withoutRules(rawFixture("yard"));
    withX.units["x-note"] = 1;
    withX.strips[0]["x-flag"] = true;
    withX.lanes[0]["x-speed"] = 3;
    withX.zones = [{ id: "z", kind: "walkable", points: [[0, 0], [1, 0], [1, 1]], "x-tag": "a" }];
    const file = runtimeOf(withX);
    expect(file.units).toEqual({ name: "u", note: "abstract unit" });
    expect(Object.keys(file.strips[0])).toEqual(["id", "v", "kind", "scale"]);
    expect(Object.keys(file.lanes[0])).toEqual(["id", "kind", "width", "dir", "points"]);
    expect(file.zones).toEqual([{ id: "z", kind: "walkable", points: [[0, 0], [1, 0], [1, 1]] }]);
  });

  it("writes the footprint after rotation and parts and anchors in world units", () => {
    const raw = rawFixture("yard");
    raw.types.bench.anchors.push({ id: "back", at: [0, 0, 0] });
    const bench = raw.objects.find((o: any) => o.id === "bench");
    bench.rot = 90;
    bench.pos = [10, 20];
    const file = runtimeOf(raw);
    const out = file.objects.find((o: any) => o.id === "bench");
    // The bench is 1.2 x 0.4 x 0.5; turned by 90 degrees its footprint is 0.4 x 1.2.
    expect(out.rot).toBe(90);
    expect(out.footprint).toEqual([10, 20, 10.4, 21.2]);
    expect(out.parts).toHaveLength(1);
    expect(out.parts[0].id).toBe("body");
    expect(out.parts[0].box).toEqual([10, 20, 0, 10.4, 21.2, 0.5]);
    // Anchor seat1 at (0.3, 0.2) in type coordinates maps to (pos.u + d - y, pos.v + x) at 90 degrees.
    expect(out.anchors[0]).toEqual({ id: "seat1", at: [10.2, 20.3, 0.5], facing: "back", kind: "seat" });
    // An anchor without facing and kind has only id and at.
    expect(out.anchors[1]).toEqual({ id: "back", at: [10.4, 20, 0] });
  });

  it("rounds computed numbers to 6 decimals", () => {
    const raw = rawFixture("yard");
    raw.objects[0].pos = [3.1234567891, 0.2];
    const file = runtimeOf(raw);
    const tree = file.objects[0];
    for (const x of [...tree.footprint, ...tree.parts.flatMap((p: any) => p.box)]) expect(Number(x.toFixed(6))).toBe(x);
    expect(tree.footprint[0]).toBe(3.123457);
    // pos is copied as it is in the scene.
    expect(tree.pos).toEqual([3.1234567891, 0.2]);
  });

  it("gives the camera direction with 9 decimals", () => {
    const raw = rawFixture("yard");
    raw.camera.angleU = 26.565;
    raw.camera.angleV = 153.435;
    const dir = runtimeOf(raw).cameraDir;
    expect(dir).toEqual(orderDirection(raw.camera));
    expect(dir[2]).toBe(1);
    for (const x of dir) expect(Number(x.toFixed(9))).toBe(x);
    // A 2:1 camera moves one unit of u or v to one half pixel of height: c = (1.118034, 1.118034, 1).
    expect(dir[0]).toBeCloseTo(1.118, 2);
    expect(dir[1]).toBeCloseTo(1.118, 2);
  });

  it("does not carry relations, checks, locks, assumptions, states or generation hints", () => {
    const text = serializeJson(runtimeFile(yard));
    for (const word of ["relations", "checks", "locks", "assumptions", "states", "genHint", "maxOccluded"]) {
      expect(text, word).not.toContain(`"${word}"`);
    }
  });

  it("is a function of the scene only: a scene that differs in a lock gives the same bytes", () => {
    const raw = rawFixture("yard");
    raw.objects[1].locks = ["pos"];
    raw.relations = [];
    const a = serializeJson(runtimeFile(yard));
    const b = serializeJson(runtimeFile(parseScene(JSON.stringify(raw))));
    expect(b).toBe(a);
  });
});

describe("runtime file: part order", () => {
  it("draws the actor behind the trunk and the canopy in front, as in the yard fixture", () => {
    const file = runtimeFile(loadScene("yard"));
    const order = (obj: string, part: string): number =>
      file.objects.find((o) => o.id === obj)!.parts.find((p) => p.id === part)!.order;
    expect(order("actor", "body")).toBeLessThan(order("tree", "trunk"));
    expect(order("tree", "trunk")).toBeLessThan(order("tree", "canopy"));
  });

  it("numbers the parts of a scene without objects as an empty list", () => {
    const raw = withoutRules(rawFixture("yard"));
    raw.objects = [];
    expect(runtimeOf(raw).objects).toEqual([]);
  });

  it("breaks exact ties by file order", () => {
    const tie = (ids: readonly string[]): Record<string, any> => {
      const raw = withoutRules(rawFixture("yard"));
      raw.types = { block: { size: [2, 2, 2] } };
      // Both centers have the same depth (3) and the boxes interpenetrate, so neither must go first.
      const pos: Record<string, number[]> = { a: [0, 0], b: [0.5, -0.5] };
      raw.objects = ids.map((id) => ({ id, type: "block", pos: pos[id] }));
      return raw;
    };
    const orders = (raw: Record<string, any>): Record<string, number> =>
      Object.fromEntries(runtimeOf(raw).objects.map((o: any) => [o.id, o.parts[0].order]));
    expect(orders(tie(["a", "b"]))).toEqual({ a: 0, b: 1 });
    expect(orders(tie(["b", "a"]))).toEqual({ a: 1, b: 0 });
  });
});
