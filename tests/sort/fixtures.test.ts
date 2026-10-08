import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { runChecks } from "../../src/core/checks";
import { runChecksInState } from "../../src/core/checks/inState";
import { compareVariants } from "../../src/core/compare/compare";
import { compareJson, formatCompareMarkdown, formatCompareText } from "../../src/core/compare/format";
import { memoryIo } from "../helpers/cli";
import { expectMatchesCompare, expectMatchesExpected, type CompareExpected, type ExpectedFile } from "../helpers/fixtures";
import { loadSortCases, loadSortScene, readSortJson, readSortText, sortFilePath, sortScenePath, stateArgs } from "../helpers/sort";

const { cases, compare } = loadSortCases();

function exitCode(expected: ExpectedFile): number {
  return expected.results.some((r) => r.status === "fail" || r.status === "skip") ? 1 : 0;
}

describe("sort fixtures: check results", () => {
  it("lists the court scene in its default state and in two states", () => {
    expect(cases.map((c) => c.state)).toEqual([null, "closed", "cleared"]);
  });

  for (const c of cases) {
    const expected = readSortJson<ExpectedFile>(c.checks);
    const label = `${c.scene}${c.state === null ? "" : ` in state ${c.state}`}`;

    it(`${label}: the core gives ${c.checks}`, () => {
      const scene = loadSortScene(c);
      const results = c.state === null ? runChecks(scene) : runChecksInState(scene, c.state);
      expectMatchesExpected(results, expected);
    });

    it(`${label}: check --json gives ${c.checks} and exits ${exitCode(expected)}`, () => {
      const cap = memoryIo();
      const code = run(["check", sortScenePath(c), "--json", ...stateArgs(c.state)], cap.io);
      const report = JSON.parse(cap.out());
      expect(code).toBe(exitCode(expected));
      expect(report.scene).toBe(expected.scene);
      expect(Object.keys(report)).toEqual(["scene", "results"]);
      expectMatchesExpected(report.results, expected);
    });

    it(`${label}: positions, ids and values are the same on every run`, () => {
      const scene = loadSortScene(c);
      const once = JSON.stringify(c.state === null ? runChecks(scene) : runChecksInState(scene, c.state));
      expect(JSON.stringify(c.state === null ? runChecks(scene) : runChecksInState(scene, c.state))).toBe(once);
    });
  }

  it("states a worst area and a number of positions for every result that is not skipped", () => {
    for (const c of cases) {
      for (const r of readSortJson<ExpectedFile>(c.checks).results) {
        if (r.status === "skip") continue;
        expect(typeof r.worst, `${c.checks} ${r.id as string}`).toBe("number");
        expect(typeof r.positions, `${c.checks} ${r.id as string}`).toBe("number");
      }
    }
  });
});

describe("sort fixtures: compare", () => {
  for (const c of compare) {
    const files: Record<string, string> = Object.fromEntries(c.variants.map((v) => [v.file, readSortText(v.file)]));
    const variantArgs = c.variants.flatMap((v) => ["--variant", `${v.name}=${v.file}`]);
    const label = `${c.scene} with ${c.variants.map((v) => v.name).join(", ")}`;

    function compareCli(format: string): string {
      const cap = memoryIo(files);
      expect(run(["compare", sortScenePath(c), ...variantArgs, ...stateArgs(c.state), "--format", format], cap.io)).toBe(0);
      return cap.out();
    }

    it(`${label}: the json equals ${c.expected.json} within its tolerance`, () => {
      expectMatchesCompare(JSON.parse(compareCli("json")), readSortJson<CompareExpected>(c.expected.json));
    });

    it(`${label}: the text equals ${c.expected.text} byte for byte`, () => {
      expect(compareCli("text")).toBe(readSortText(c.expected.text));
    });

    it(`${label}: the Markdown equals ${c.expected.md} byte for byte`, () => {
      expect(compareCli("md")).toBe(readSortText(c.expected.md));
    });

    it(`${label}: the core gives the same text, Markdown and JSON`, () => {
      const comparison = compareVariants(loadSortScene(c), c.variants.map((v) => ({ name: v.name, text: files[v.file] as string })), c.state ?? undefined);
      expect(`${formatCompareText(comparison)}\n`).toBe(readSortText(c.expected.text));
      expect(`${formatCompareMarkdown(comparison)}\n`).toBe(readSortText(c.expected.md));
      expectMatchesCompare(JSON.parse(JSON.stringify(compareJson(comparison))), readSortJson<CompareExpected>(c.expected.json));
    });
  }

  it("finds every variant file next to the case list", () => {
    for (const c of compare) for (const v of c.variants) expect(readSortText(v.file).length, v.file).toBeGreaterThan(0);
    expect(sortFilePath("cases.json")).toMatch(/sort[\\/]cases\.json$/);
  });
});
