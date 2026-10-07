import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { toSvg } from "../../src/cli/svg";
import { buildDisplayList } from "../../src/core/displayList";
import { caseScenePath, exportFilePath, loadCaseScene, loadExportCases } from "../helpers/exportCases";
import { fixturePath, loadScene } from "../helpers/fixtures";
import { memoryIo } from "../helpers/cli";
import { decodePng, maxChannelDifference, testRasterizer } from "../helpers/png";
import { readFileSync } from "node:fs";

const { tolerance, cases } = loadExportCases();
const withPng = cases.filter((c) => c.png !== null);

async function render(argv: string[]) {
  const cap = memoryIo({}, await testRasterizer());
  const code = run(argv, cap.io);
  return { code, out: cap.out(), err: cap.err(), files: cap.files, bytes: cap.bytes };
}

describe("cli: render -o out.png", () => {
  it("has a case with a PNG in the case list", () => {
    expect(withPng.map((c) => c.name)).toEqual(["yard", "garden"]);
  });

  for (const c of withPng) {
    it(`${c.name}: the image has the size of ${c.png} and every channel is within ${tolerance.pngChannel}`, async () => {
      const r = await render(["render", caseScenePath(c), "-o", "out.png"]);
      expect(r.code).toBe(0);
      expect(r.out).toBe("wrote out.png\n");
      const bytes = r.bytes.get("out.png") as Uint8Array;
      const actual = decodePng(bytes);
      const expected = decodePng(readFileSync(exportFilePath(c.png as string)));
      expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
      expect(maxChannelDifference(actual, expected)).toBeLessThanOrEqual(tolerance.pngChannel);
    });

    it(`${c.name}: two runs give identical bytes`, async () => {
      const a = (await render(["render", caseScenePath(c), "-o", "a.png"])).bytes.get("a.png") as Uint8Array;
      const b = (await render(["render", caseScenePath(c), "-o", "b.png"])).bytes.get("b.png") as Uint8Array;
      expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    });
  }

  it("is a PNG of the frame size for a scene with no expected image", async () => {
    const r = await render(["render", fixturePath("lane"), "-o", "lane.png"]);
    expect(r.code).toBe(0);
    const image = decodePng(r.bytes.get("lane.png") as Uint8Array);
    const scene = loadScene("lane");
    expect([image.width, image.height]).toEqual([scene.frame.w, scene.frame.h]);
  });

  it("accepts an upper-case extension and does not write an SVG file", async () => {
    const r = await render(["render", fixturePath("yard"), "-o", "OUT.PNG"]);
    expect(r.code).toBe(0);
    expect(r.bytes.has("OUT.PNG")).toBe(true);
    expect(r.files.size).toBe(0);
  });

  it("exits 70 when the host gave no rasterizer", () => {
    const cap = memoryIo();
    expect(run(["render", fixturePath("yard"), "-o", "o.png"], cap.io)).toBe(70);
    expect(cap.err()).toMatch(/^error E_INTERNAL: .*PNG/);
  });

  it("does not depend on fonts: the SVG for a PNG has no text", () => {
    const list = buildDisplayList(loadCaseScene(withPng[0]!));
    expect(toSvg(list)).toContain("<text ");
    expect(toSvg(list, { text: false })).not.toContain("<text");
  });

  it("still writes SVG for an .svg output, text included", async () => {
    const r = await render(["render", fixturePath("yard"), "-o", "o.svg"]);
    expect(r.code).toBe(0);
    expect(r.files.get("o.svg")).toContain("<text ");
    expect(r.bytes.size).toBe(0);
  });
});
