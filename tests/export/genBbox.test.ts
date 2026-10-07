import { describe, expect, it } from "vitest";
import { genBboxFile } from "../../src/core/export/genBbox";
import { serializeJson } from "../../src/core/serialize";
import { parseScene } from "../../src/core/validate";
import { bboxOptions, expectSameJson, loadCaseScene, loadExportCases, readExportJson, withoutRules } from "../helpers/exportCases";
import { loadScene, rawFixture } from "../helpers/fixtures";

const { tolerance, cases } = loadExportCases();

function bboxOf(raw: Record<string, any>, units: "px" | "norm1000" = "px", order: "xyxy" | "yxyx" = "xyxy"): any {
  return JSON.parse(serializeJson(genBboxFile(parseScene(JSON.stringify(raw)), { units, order })));
}

describe("gen-bbox: every flag set of tests/fixtures/export/cases.json", () => {
  for (const c of cases) {
    for (const g of c.genBbox) {
      const tol = bboxOptions(g.args).units === "px" ? tolerance.px : tolerance.norm1000;
      it(`${c.name} ${g.args.join(" ") || "(defaults)"} equals ${g.file} (keys in order, numbers within ${tol})`, () => {
        const scene = loadCaseScene(c);
        const text = serializeJson(genBboxFile(scene, bboxOptions(g.args)));
        expectSameJson(JSON.parse(text), readExportJson(g.file), tol, g.file);
        expect(text).toBe(serializeJson(genBboxFile(scene, bboxOptions(g.args))));
      });
    }
  }
});

describe("gen-bbox: rules of SPEC 14", () => {
  const yard = loadScene("yard");

  it("has the top-level keys in order and describes the options", () => {
    const file = genBboxFile(yard, { units: "px", order: "xyxy" });
    expect(Object.keys(file)).toEqual(["schema", "scene", "frame", "units", "order", "boxes"]);
    expect(file.schema).toBe("isoblock-genbbox/1");
    expect(file.frame).toEqual({ w: 1000, h: 1000 });
    expect(file.units).toBe("px");
    expect(file.order).toBe("xyxy");
    expect(Object.keys(file.boxes[0] as object)).toEqual(["id", "type", "box", "clipped", "hint"]);
  });

  it("writes one box per object in file order, with the hint only when the type has one", () => {
    const raw = rawFixture("yard");
    delete raw.types.actor.genHint;
    const file = bboxOf(raw);
    expect(file.boxes.map((b: any) => b.id)).toEqual(["tree", "actor", "crate1", "crate2", "bench"]);
    expect(Object.keys(file.boxes[1])).toEqual(["id", "type", "box", "clipped"]);
    expect(file.boxes[0].hint).toBe("young tree with a round canopy");
  });

  it("rounds pixels to 2 decimals", () => {
    for (const b of bboxOf(rawFixture("yard")).boxes) for (const x of b.box) expect(Number(x.toFixed(2))).toBe(x);
  });

  it("takes the bounds of every corner of every part, not of the footprint", () => {
    // The tree: the canopy is wider than the trunk and sticks out of the footprint.
    const tree = bboxOf(rawFixture("yard")).boxes[0];
    expect(tree.box).toEqual([383.14, 220, 604.84, 488]);
  });

  it("converts to norm1000 with halves rounded up", () => {
    const raw = withoutRules(rawFixture("yard"));
    raw.frame.w = 800;
    raw.frame.h = 800;
    raw.frame.regions = [{ id: "view", rect: [0, 0, 800, 800] }];
    raw.objects = [{ id: "a", type: "crate", pos: [0, 0] }];
    raw.camera.origin = [400, 100];
    const px = bboxOf(raw, "px").boxes[0].box as number[];
    const norm = bboxOf(raw, "norm1000").boxes[0].box as number[];
    expect(norm[0]).toBe(Math.floor((px[0]! * 1000) / 800 + 0.5));
    expect(norm[1]).toBe(Math.floor((px[1]! * 1000) / 800 + 0.5));
    expect(norm[2]).toBe(Math.floor((px[2]! * 1000) / 800 + 0.5));
    expect(norm[3]).toBe(Math.floor((px[3]! * 1000) / 800 + 0.5));
    for (const x of norm) expect(Number.isInteger(x)).toBe(true);
  });

  it("rounds 0.5 of norm1000 up, not to even", () => {
    const raw = withoutRules(rawFixture("yard"));
    // A frame 2000 wide makes 1 px exactly 0.5 in norm1000.
    raw.frame.w = 2000;
    raw.frame.h = 2000;
    raw.frame.regions = [{ id: "view", rect: [0, 0, 2000, 2000] }];
    raw.camera = { angleU: 0, angleV: 90, pxPerUnit: 1, verticalScale: 1, origin: [1, 1] };
    raw.objects = [{ id: "a", type: "crate", pos: [0, 0] }];
    raw.types = { crate: { size: [1, 1, 1] } };
    const box = bboxOf(raw, "norm1000").boxes[0].box as number[];
    // x runs from 1 to 2 px of 2000: 0.5 and 1 in norm1000; 0.5 rounds up to 1.
    expect(box[0]).toBe(1);
    expect(box[2]).toBe(1);
  });

  it("orders yxyx as y0, x0, y1, x1", () => {
    const xy = bboxOf(rawFixture("yard"), "px", "xyxy").boxes[0].box as number[];
    const yx = bboxOf(rawFixture("yard"), "px", "yxyx").boxes[0].box as number[];
    expect(yx).toEqual([xy[1], xy[0], xy[3], xy[2]]);
  });

  it("clips boxes to the frame and marks them", () => {
    const raw = withoutRules(rawFixture("yard"));
    raw.objects[2].pos = [-4, 0.5];
    const crate = bboxOf(raw).boxes.find((b: any) => b.id === "crate1");
    expect(crate.clipped).toBe(true);
    expect(crate.box[0]).toBe(0);
    expect(crate.box[2]).toBeGreaterThan(0);
  });

  it("leaves out an object whose box has no width or height inside the frame", () => {
    const raw = withoutRules(rawFixture("yard"));
    raw.objects[2].pos = [-40, 0.5];
    expect(bboxOf(raw).boxes.map((b: any) => b.id)).not.toContain("crate1");
    expect(bboxOf(raw).boxes).toHaveLength(4);
  });

  it("does not mark a box that only touches the frame edge as clipped", () => {
    const raw = withoutRules(rawFixture("yard"));
    raw.camera = { angleU: 0, angleV: 90, pxPerUnit: 100, verticalScale: 1, origin: [0, 100] };
    raw.types = { crate: { size: [1, 1, 1] } };
    raw.objects = [{ id: "a", type: "crate", pos: [0, 0] }];
    const box = bboxOf(raw).boxes[0];
    expect(box.box[0]).toBe(0);
    expect(box.clipped).toBe(false);
  });

  it("gives an empty list of boxes for a scene without objects", () => {
    const raw = withoutRules(rawFixture("yard"));
    raw.objects = [];
    expect(bboxOf(raw).boxes).toEqual([]);
  });
});
