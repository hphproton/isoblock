import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  expectMatchesRelations,
  loadRelationsExpected,
  loadSolverExpected,
  relationsScenePath,
  repoRoot,
  solverFixtureNames,
  solverScenePath,
} from "../helpers/fixtures";

const dist = join(repoRoot, "dist", "isoblock.mjs");
let work = "";

function node(...args: string[]) {
  return spawnSync(process.execPath, [dist, ...args], { encoding: "utf8" });
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "isoblock-solve-"));
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe("dist/isoblock.mjs: relations and solve", () => {
  it("relations --json gives the expected results of the relation fixture and exits 1", () => {
    const r = node("relations", "--json", relationsScenePath());
    expect(r.status).toBe(1);
    expectMatchesRelations(JSON.parse(r.stdout).results, loadRelationsExpected());
  });

  for (const name of solverFixtureNames()) {
    it(`solve ${name}: status, conflict, byte-identical runs, the patch gives the proposal file`, () => {
      const expected = loadSolverExpected(name);
      const scene = join(work, `${name}.scene.json`);
      copyFileSync(solverScenePath(name), scene);
      const only = expected.only === null ? [] : ["--only", expected.only.join(",")];
      const outputs = (k: number) => ["-o", join(work, `${name}.${k}.json`), "--patch", join(work, `${name}.${k}.patch`)];
      const first = node("solve", scene, ...only, ...outputs(1), "--json");
      const second = node("solve", scene, ...only, ...outputs(2), "--json");
      expect(first.status).toBe(expected.status === "solved" ? 0 : 1);
      expect(second.stdout).toBe(first.stdout);
      const read = (file: string) => readFileSync(join(work, file), "utf8");
      expect(read(`${name}.2.json`)).toBe(read(`${name}.1.json`));
      expect(read(`${name}.2.patch`)).toBe(read(`${name}.1.patch`));
      expect(readFileSync(scene, "utf8")).toBe(readFileSync(solverScenePath(name), "utf8"));
      const report = JSON.parse(first.stdout);
      expect([report.status, report.conflict]).toEqual([expected.status, expected.conflict]);
      const applied = node("patch", scene, join(work, `${name}.1.patch`), "-o", join(work, `${name}.applied.json`), "--json");
      expect(JSON.parse(applied.stdout).status).toBe("applied");
      expect(read(`${name}.applied.json`)).toBe(read(`${name}.1.json`));
    });
  }
});
