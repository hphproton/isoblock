import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { runChecks } from "../../src/core/checks";
import { runChecksInState } from "../../src/core/checks/inState";
import type { CheckResult, Scene } from "../../src/core/types";
import { parseScene } from "../../src/core/validate";
import { memoryIo } from "../helpers/cli";
import { expectMatchesExpected, repoRoot, type ExpectedFile } from "../helpers/fixtures";

const root = join(repoRoot, "tests/fixtures/order");
const file = JSON.parse(readFileSync(join(root, "cases.json"), "utf8")) as {
  tolerance: ExpectedFile["tolerance"];
  checks: readonly { scene: string; state: string | null; checks: readonly Record<string, unknown>[] }[];
};

function sceneOf(path: string): Scene {
  return parseScene(readFileSync(join(repoRoot, path), "utf8"));
}

/** `pairs` is present only when the expected result has it (SPEC 9.9). */
function expectPairs(results: readonly CheckResult[], expected: ExpectedFile): void {
  expected.results.forEach((exp, index) => {
    const act = results[index] as unknown as Record<string, unknown>;
    if ("pairs" in exp) expect(act.pairs, `${exp.id as string} pairs`).toEqual(exp.pairs);
    else expect(act, `${exp.id as string} has no pairs`).not.toHaveProperty("pairs");
  });
}

describe("order fixtures (SPEC 9.9, 17)", () => {
  for (const c of file.checks) {
    const label = `${c.scene} state ${c.state ?? "default"}`;
    const slow = c.scene.endsWith("large.scene.json");

    it(`${label}: check --json matches the expected results`, () => {
      const args = ["check", "--json", join(repoRoot, c.scene)];
      if (c.state !== null) args.push("--state", c.state);
      const cap = memoryIo();
      const code = run(args, cap.io);
      const report = JSON.parse(cap.out()) as { scene: string; results: CheckResult[] };
      const expected: ExpectedFile = { scene: sceneOf(c.scene).id, tolerance: file.tolerance, results: c.checks };
      expect(code).toBe(c.checks.some((row) => row.status === "fail" || row.status === "skip") ? 1 : 0);
      expect(report.scene).toBe(expected.scene);
      expectMatchesExpected(report.results, expected);
      expectPairs(report.results, expected);
    }, slow ? 60_000 : 30_000);

    it(`${label}: the core matches the expected results`, () => {
      const scene = sceneOf(c.scene);
      const results = c.state === null ? runChecks(scene) : runChecksInState(scene, c.state);
      const expected: ExpectedFile = { scene: scene.id, tolerance: file.tolerance, results: c.checks };
      expectMatchesExpected(results, expected);
      expectPairs(results, expected);
    }, slow ? 60_000 : 30_000);
  }
});
