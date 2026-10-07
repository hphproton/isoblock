import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bboxOptions, caseScenePath, exportFilePath, expectSameJson, loadExportCases, readExportJson,
} from "../helpers/exportCases";
import { fixturePath, repoRoot } from "../helpers/fixtures";
import { decodePng, maxChannelDifference } from "../helpers/png";

const dist = join(repoRoot, "dist", "isoblock.mjs");
const { tolerance, cases } = loadExportCases();
let work = "";

function node(args: string[], cwd?: string, script = dist) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", ...(cwd === undefined ? {} : { cwd }) });
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "isoblock-export-"));
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe("dist/isoblock.mjs: export", () => {
  for (const c of cases) {
    it(`${c.name}: runtime file equals ${c.runtime} and two runs give the same bytes`, () => {
      const a = node(["export", caseScenePath(c), "--target", "runtime"]);
      const b = node(["export", caseScenePath(c), "--target", "runtime"]);
      expect(a.status).toBe(0);
      expectSameJson(JSON.parse(a.stdout), readExportJson(c.runtime), tolerance.world, c.name);
      expect(b.stdout).toBe(a.stdout);
    });

    for (const g of c.genBbox) {
      const tol = bboxOptions(g.args).units === "px" ? tolerance.px : tolerance.norm1000;
      it(`${c.name} ${g.args.join(" ") || "(defaults)"}: equals ${g.file} and two runs give the same bytes`, () => {
        const out = join(work, `${c.name}-${g.file}`);
        const argv = ["export", caseScenePath(c), "--target", "gen-bbox", ...g.args, "-o", out];
        expect(node(argv).status).toBe(0);
        const first = readFileSync(out, "utf8");
        expectSameJson(JSON.parse(first), readExportJson(g.file), tol, g.file);
        expect(node(argv).status).toBe(0);
        expect(readFileSync(out, "utf8")).toBe(first);
      });
    }
  }

  it("exits 2 with E_USAGE for a missing target, an unscheduled target and bbox flags with runtime", () => {
    for (const argv of [
      ["export", fixturePath("yard")],
      ["export", fixturePath("yard"), "--target", "godot"],
      ["export", fixturePath("yard"), "--target", "runtime", "--bbox-units", "px"],
    ]) {
      const r = node(argv);
      expect(r.status, argv.join(" ")).toBe(2);
      expect(r.stderr).toMatch(/^error E_USAGE: /);
      expect(r.stdout).toBe("");
    }
  });
});

describe("dist/isoblock.mjs: render -o out.png", () => {
  for (const c of cases.filter((x) => x.png !== null)) {
    it(`${c.name}: decodes to ${c.png} within ${tolerance.pngChannel} per channel`, () => {
      const out = join(work, `${c.name}.png`);
      const r = node(["render", caseScenePath(c), "-o", out]);
      expect(r.status).toBe(0);
      const actual = decodePng(readFileSync(out));
      const expected = decodePng(readFileSync(exportFilePath(c.png as string)));
      expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
      expect(maxChannelDifference(actual, expected)).toBeLessThanOrEqual(tolerance.pngChannel);
    });
  }

  it("works when the file is copied alone into an empty directory", () => {
    const empty = join(work, "alone");
    mkdirSync(empty);
    copyFileSync(dist, join(empty, "isoblock.mjs"));
    expect(readdirSync(empty)).toEqual(["isoblock.mjs"]);
    const r = node(["render", fixturePath("yard"), "-o", "yard.png"], empty, join(empty, "isoblock.mjs"));
    expect(r.status, r.stderr).toBe(0);
    expect(readdirSync(empty).sort()).toEqual(["isoblock.mjs", "yard.png"]);
    const png = readFileSync(join(empty, "yard.png"));
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(statSync(join(empty, "yard.png")).size).toBeGreaterThan(1000);
    const image = decodePng(png);
    expect([image.width, image.height]).toEqual([1000, 1000]);
  });

  it("writes identical PNG bytes on two runs", () => {
    const a = join(work, "twice-a.png");
    const b = join(work, "twice-b.png");
    expect(node(["render", fixturePath("yard"), "-o", a]).status).toBe(0);
    expect(node(["render", fixturePath("yard"), "-o", b]).status).toBe(0);
    expect(readFileSync(a).equals(readFileSync(b))).toBe(true);
  });

  it("still writes an SVG with text for an .svg output", () => {
    const out = join(work, "yard.svg");
    expect(node(["render", fixturePath("yard"), "-o", out]).status).toBe(0);
    expect(readFileSync(out, "utf8")).toContain("<text ");
  });
});
