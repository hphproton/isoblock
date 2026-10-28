import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { runChecks } from "../../src/core/checks";
import { runChecksInState } from "../../src/core/checks/inState";
import { compareVariants } from "../../src/core/compare/compare";
import { compareJson, formatCompareMarkdown, formatCompareText } from "../../src/core/compare/format";
import { describeScene } from "../../src/core/describe";
import { checkLines } from "../../src/core/describeChecks";
import type { CheckResult, Scene } from "../../src/core/types";
import { parseScene } from "../../src/core/validate";
import { memoryIo } from "../helpers/cli";
import { expectMatchesCompare, expectMatchesExpected, repoRoot, type CompareExpected, type ExpectedFile } from "../helpers/fixtures";

const root = join(repoRoot, "tests/fixtures/explain");
const file = JSON.parse(readFileSync(join(root, "cases.json"), "utf8")) as {
  tolerance: ExpectedFile["tolerance"] & { share: number };
  checks: readonly { scene: string; state: string | null; checks: readonly Record<string, unknown>[] }[];
  describe: { scene: string; expected: string };
  compare: readonly {
    scene: string;
    state: string | null;
    variants: readonly { name: string; file: string }[];
    expected: { json: string; txt: string; md: string };
  }[];
};

function sceneText(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

function sceneOf(path: string): Scene {
  return parseScene(sceneText(path));
}

function expectedOf(scene: string, checks: readonly Record<string, unknown>[]): ExpectedFile {
  return { scene: sceneOf(scene).id, tolerance: file.tolerance, results: checks };
}

function resultsOf(scene: string, state: string | null): readonly CheckResult[] {
  const parsed = sceneOf(scene);
  return state === null ? runChecks(parsed) : runChecksInState(parsed, state);
}

describe("explain fixtures (SPEC 9.7, 17)", () => {
  for (const c of file.checks) {
    const label = `${c.scene} state ${c.state ?? "default"}`;
    const expected = expectedOf(c.scene, c.checks);

    it(`${label}: check --json matches the expected results`, () => {
      const args = ["check", "--json", join(repoRoot, c.scene)];
      if (c.state !== null) args.push("--state", c.state);
      const cap = memoryIo();
      const code = run(args, cap.io);
      const report = JSON.parse(cap.out()) as { scene: string; results: CheckResult[] };
      expect(code).toBe(c.checks.some((row) => row.status === "fail" || row.status === "skip") ? 1 : 0);
      expect(report.scene).toBe(expected.scene);
      expectMatchesExpected(report.results, expected);
      c.checks.forEach((row, i) => {
        if ("shares" in row) {
          const actual = report.results[i]?.shares;
          expect(actual, `${row.id as string} shares`).toBeDefined();
          (row.shares as number[]).forEach((share, k) => {
            expect(Math.abs((actual?.[k] as number) - share)).toBeLessThanOrEqual(file.tolerance.share);
          });
        }
        if (row.check === "min_screen_size") {
          expect(Math.abs((report.results[i]?.value as number) - (row.value as number))).toBeLessThanOrEqual(file.tolerance.valuePx);
        }
      });
    });

    it(`${label}: the core matches the expected results`, () => {
      expectMatchesExpected(resultsOf(c.scene, c.state), expected);
    });
  }

  it("describe prints the WARN lines of margins", () => {
    const scene = sceneOf(file.describe.scene);
    const lines = checkLines(scene, runChecks(scene));
    const want = readFileSync(join(root, file.describe.expected), "utf8").split("\n").filter((line) => line.startsWith("WARN"));
    expect(lines.filter((line) => line.startsWith("WARN"))).toEqual(want);
    const described = describeScene(scene, runChecks(scene)).split("\n").filter((line) => line.startsWith("WARN"));
    expect(described).toEqual(want);
  });

  for (const c of file.compare) {
    const label = `${c.scene} state ${c.state ?? "default"}`;

    it(`${label}: compare matches the expected files`, () => {
      const variants = c.variants.map((variant) => ({ name: variant.name, text: readFileSync(join(root, variant.file), "utf8") }));
      const comparison = compareVariants(sceneOf(c.scene), variants, c.state ?? undefined);
      const json = JSON.parse(JSON.stringify(compareJson(comparison))) as Record<string, unknown>;
      const expected = JSON.parse(readFileSync(join(root, c.expected.json), "utf8")) as CompareExpected;
      expectMatchesCompare(json, { ...expected, tolerance: file.tolerance });
      expect(`${formatCompareText(comparison)}\n`).toBe(readFileSync(join(root, c.expected.txt), "utf8"));
      expect(`${formatCompareMarkdown(comparison)}\n`).toBe(readFileSync(join(root, c.expected.md), "utf8"));
    });
  }
});
