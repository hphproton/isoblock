import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectSameJson } from "../helpers/exportCases";
import { expectMatchesCompare, expectMatchesExpected, repoRoot, type CompareExpected } from "../helpers/fixtures";
import { decodePng, maxChannelDifference } from "../helpers/png";
import { caseScenePath, loadStateCases, loadStateExpected, loadWalkExpected, readStateJson, readStateText, stateFilePath, walkScenePath } from "../helpers/states";

const dist = join(repoRoot, "dist", "isoblock.mjs");
const { cases, compare } = loadStateCases();
let work = "";

function node(...args: string[]) {
  return spawnSync(process.execPath, [dist, ...args], { encoding: "utf8" });
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "isoblock-dist-states-"));
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe("dist/isoblock.mjs: the gameplay checks", () => {
  it("check --json on walk.scene.json gives walk.expected.json", () => {
    const r = node("check", walkScenePath(), "--json");
    expect(r.status).toBe(1);
    expectMatchesExpected(JSON.parse(r.stdout).results, loadWalkExpected());
  });
});

describe("dist/isoblock.mjs: --state", () => {
  for (const c of cases) {
    const label = `${c.scene} in state ${c.state}`;

    it(`${label}: check --json gives ${c.checks}`, () => {
      const r = node("check", caseScenePath(c), "--json", "--state", c.state);
      const expected = loadStateExpected(c);
      expect(r.status).toBe(expected.results.some((x) => x.status === "fail" || x.status === "skip") ? 1 : 0);
      expectMatchesExpected(JSON.parse(r.stdout).results, expected);
    });

    if (c.genBbox !== null) {
      it(`${label}: export --target gen-bbox gives ${c.genBbox}`, () => {
        const r = node("export", caseScenePath(c), "--target", "gen-bbox", "--state", c.state);
        expect(r.status).toBe(0);
        expectSameJson(JSON.parse(r.stdout), readStateJson(c.genBbox as string), 0.02, c.genBbox as string);
      });
    }

    if (c.png !== null) {
      it(`${label}: render -o out.png gives ${c.png}`, () => {
        const out = join(work, `${c.state}.png`);
        expect(node("render", caseScenePath(c), "--state", c.state, "-o", out).status).toBe(0);
        const actual = decodePng(readFileSync(out));
        const expected = decodePng(readFileSync(stateFilePath(c.png as string)));
        expect(maxChannelDifference(actual, expected)).toBeLessThanOrEqual(1);
      });
    }
  }

  for (const c of compare) {
    const args = [
      "compare", caseScenePath(c),
      ...c.variants.flatMap((v) => ["--variant", `${v.name}=${stateFilePath(v.file)}`]),
      "--state", c.state,
    ];

    it(`${c.scene} in state ${c.state}: compare gives the text, the Markdown and the json`, () => {
      expect(node(...args).stdout).toBe(readStateText(c.expected.text));
      expect(node(...args, "--format", "md").stdout).toBe(readStateText(c.expected.md));
      expectMatchesCompare(JSON.parse(node(...args, "--format", "json").stdout), readStateJson<CompareExpected>(c.expected.json));
    });
  }

  it("exits 2 with E_USAGE for an unknown state and for the runtime target", () => {
    const c = cases[0]!;
    const unknown = node("check", caseScenePath(c), "--state", "night");
    expect([unknown.status, unknown.stdout]).toEqual([2, ""]);
    expect(unknown.stderr).toMatch(/^error E_USAGE: unknown state 'night'/);
    const runtime = node("export", caseScenePath(c), "--target", "runtime", "--state", c.state);
    expect(runtime.status).toBe(2);
    expect(runtime.stderr).toMatch(/--state applies to the gen-bbox target only/);
  });
});
