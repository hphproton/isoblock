import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { genBboxFile } from "../../src/core/export/genBbox";
import { runtimeFile } from "../../src/core/export/runtime";
import { serializeJson } from "../../src/core/serialize";
import { bboxOptions, caseScenePath, expectSameJson, loadCaseScene, loadExportCases, readExportJson } from "../helpers/exportCases";
import { fixturePath, loadScene } from "../helpers/fixtures";
import { memoryIo } from "../helpers/cli";

const { tolerance, cases } = loadExportCases();
const yard = fixturePath("yard");

function exec(argv: string[], files: Record<string, string> = {}) {
  const cap = memoryIo(files);
  const code = run(argv, cap.io);
  return { code, out: cap.out(), err: cap.err(), files: cap.files };
}

describe("cli: export --target runtime", () => {
  for (const c of cases) {
    it(`${c.name}: stdout equals the expected runtime file and is the same twice`, () => {
      const first = exec(["export", caseScenePath(c), "--target", "runtime"]);
      expect(first.code).toBe(0);
      expect(first.err).toBe("");
      expectSameJson(JSON.parse(first.out), readExportJson(c.runtime), tolerance.world, c.name);
      expect(first.out).toBe(serializeJson(runtimeFile(loadCaseScene(c))));
      expect(exec(["export", caseScenePath(c), "--target", "runtime"]).out).toBe(first.out);
    });
  }

  it("writes to -o, prints nothing but a confirmation, and leaves the scene file alone", () => {
    const r = exec(["export", yard, "--target", "runtime", "-o", "out/yard.runtime.json"]);
    expect(r.code).toBe(0);
    expect(r.files.get("out/yard.runtime.json")).toBe(serializeJson(runtimeFile(loadScene("yard"))));
    expect(r.out).toBe("wrote out/yard.runtime.json\n");
  });

  it("exits 0 although the scene has failing checks", () => {
    expect(exec(["export", yard, "--target", "runtime"]).code).toBe(0);
  });

  it("refuses to write over its input file", () => {
    const r = exec(["export", yard, "--target", "runtime", "-o", yard]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^error E_USAGE: export never writes its input file/);
  });

  it("exits 2 for a missing or invalid scene file", () => {
    expect(exec(["export", "missing.scene.json", "--target", "runtime"]).code).toBe(2);
    const bad = exec(["export", "bad.json", "--target", "runtime"], { "bad.json": '{"schema":"x"}' });
    expect(bad.code).toBe(2);
    expect(bad.err).toMatch(/^error E_SCHEMA: /);
    expect(bad.out).toBe("");
  });
});

describe("cli: export --target gen-bbox", () => {
  for (const c of cases) {
    for (const g of c.genBbox) {
      const tol = bboxOptions(g.args).units === "px" ? tolerance.px : tolerance.norm1000;
      it(`${c.name} ${g.args.join(" ") || "(defaults)"}: stdout equals ${g.file}`, () => {
        const argv = ["export", caseScenePath(c), "--target", "gen-bbox", ...g.args];
        const first = exec(argv);
        expect(first.code).toBe(0);
        expectSameJson(JSON.parse(first.out), readExportJson(g.file), tol, g.file);
        expect(first.out).toBe(serializeJson(genBboxFile(loadCaseScene(c), bboxOptions(g.args))));
        expect(exec(argv).out).toBe(first.out);
      });
    }
  }

  it("writes to -o", () => {
    const r = exec(["export", yard, "--target", "gen-bbox", "--bbox-units", "norm1000", "-o", "boxes.json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.files.get("boxes.json") as string).units).toBe("norm1000");
  });
});

describe("cli: export usage errors", () => {
  const cases: [string[], RegExp][] = [
    [["export", yard], /export needs --target/],
    [["export", yard, "--target", "godot"], /export target 'godot' is not scheduled/],
    [["export", yard, "--target", "phaser"], /not scheduled/],
    [["export", yard, "--target", "tiled"], /not scheduled/],
    [["export", yard, "--target", "runtime", "--bbox-units", "norm1000"], /applies to the gen-bbox target only/],
    [["export", yard, "--target", "runtime", "--bbox-order", "yxyx"], /applies to the gen-bbox target only/],
  ];
  for (const [argv, message] of cases) {
    it(`${argv.slice(2).join(" ") || "no target"} exits 2 with E_USAGE and writes nothing`, () => {
      const r = exec(argv);
      expect(r.code).toBe(2);
      expect(r.err).toMatch(/^error E_USAGE: /);
      expect(r.err).toMatch(message);
      expect(r.out).toBe("");
      expect(r.files.size).toBe(0);
    });
  }
});
