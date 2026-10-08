import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { expectMatchesCompare, expectMatchesExpected, repoRoot, type CompareExpected, type ExpectedFile } from "../helpers/fixtures";
import { loadSortCases, readSortJson, readSortText, sortFilePath, sortScenePath, stateArgs } from "../helpers/sort";
import { join } from "node:path";

const dist = join(repoRoot, "dist", "isoblock.mjs");
const { cases, compare } = loadSortCases();

function node(...args: string[]) {
  return spawnSync(process.execPath, [dist, ...args], { encoding: "utf8" });
}

describe("dist/isoblock.mjs: sort_consistency", () => {
  for (const c of cases) {
    const label = `${c.scene}${c.state === null ? "" : ` in state ${c.state}`}`;

    it(`${label}: check --json gives ${c.checks}`, () => {
      const expected = readSortJson<ExpectedFile>(c.checks);
      const r = node("check", sortScenePath(c), "--json", ...stateArgs(c.state));
      expect(r.status).toBe(expected.results.some((x) => x.status === "fail" || x.status === "skip") ? 1 : 0);
      expectMatchesExpected(JSON.parse(r.stdout).results, expected);
    });

  }

  it("describe lists the failing and the skipped checks", () => {
    const r = node("describe", sortScenePath(cases[0]!));
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^FAIL s1 sort_consistency shed, box, counter, kiosk: drawn out of order, worst 545\.60 px2$/m);
    expect(r.stdout).toMatch(/^SKIP s6 sort_consistency: zone "mark" has 0 points; an area needs 3 or more$/m);
  });

  for (const c of compare) {
    const args = ["compare", sortScenePath(c), ...c.variants.flatMap((v) => ["--variant", `${v.name}=${sortFilePath(v.file)}`]), ...stateArgs(c.state)];

    it(`${c.scene}: compare gives the text, the Markdown and the json`, () => {
      expect(node(...args).stdout).toBe(readSortText(c.expected.text));
      expect(node(...args, "--format", "md").stdout).toBe(readSortText(c.expected.md));
      expectMatchesCompare(JSON.parse(node(...args, "--format", "json").stdout), readSortJson<CompareExpected>(c.expected.json));
    });
  }

  it("gives the same bytes on two runs", () => {
    const c = cases[0]!;
    expect(node("check", sortScenePath(c), "--json").stdout).toBe(node("check", sortScenePath(c), "--json").stdout);
  });
});
