import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { runChecks } from "../../src/core/checks";
import { runChecksInState } from "../../src/core/checks/inState";
import { describeScene } from "../../src/core/describe";
import type { CheckResult } from "../../src/core/types";
import { parseScene } from "../../src/core/validate";
import { memoryIo } from "../helpers/cli";
import { expectSameJson } from "../helpers/exportCases";
import { expectMatchesExpected, repoRoot, type ExpectedFile } from "../helpers/fixtures";

const dir = join(repoRoot, "tests", "fixtures", "levels");
const file = JSON.parse(readFileSync(join(dir, "cases.json"), "utf8")) as {
  readonly tolerance: ExpectedFile["tolerance"];
  readonly cases: readonly { readonly scene: string; readonly state: string | null; readonly checks: readonly Record<string, unknown>[]; readonly genBbox: string | null }[];
};

function sceneText(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("level fixtures (SPEC 9.5, 17)", () => {
  for (const c of file.cases) {
    const label = `${c.scene} state ${c.state ?? "default"}`;
    const expected: ExpectedFile = { scene: "levels", tolerance: file.tolerance, results: c.checks };

    it(`${label}: check matches the expected results`, () => {
      const scene = parseScene(sceneText(c.scene));
      const results = c.state === null ? runChecks(scene) : runChecksInState(scene, c.state);
      expectMatchesExpected(results, { ...expected, scene: scene.id });
      const cap = memoryIo();
      const args = ["check", join(repoRoot, c.scene), "--json", ...(c.state === null ? [] : ["--state", c.state])];
      const code = run(args, cap.io);
      const report = JSON.parse(cap.out()) as { scene: string; results: CheckResult[] };
      expect(code).toBe(c.checks.some((r) => r.status === "fail" || r.status === "skip") ? 1 : 0);
      expect(report.scene).toBe(scene.id);
      expectMatchesExpected(report.results, { ...expected, scene: scene.id });
    });

    const genBbox = c.genBbox;
    if (genBbox !== null) {
      it(`${label}: export --target gen-bbox matches ${genBbox}`, () => {
        const cap = memoryIo();
        const args = ["export", join(repoRoot, c.scene), "--target", "gen-bbox", ...(c.state === null ? [] : ["--state", c.state])];
        expect(run(args, cap.io)).toBe(0);
        const again = memoryIo();
        run(args, again.io);
        expect(cap.out()).toBe(again.out());
        expectSameJson(JSON.parse(cap.out()), JSON.parse(readFileSync(join(dir, genBbox), "utf8")), 0.02, genBbox);
      });
    }
  }

  it("describe --states matches levels.describe.txt without the check lines", () => {
    const scene = parseScene(sceneText("tests/fixtures/levels/levels.scene.json"));
    const text = describeScene(scene, runChecks(scene), { states: true });
    const kept = text.split("\n").filter((line) => !/^(FAIL|WARN|SKIP|checks:)/.test(line)).join("\n");
    const want = readFileSync(join(dir, "levels.describe.txt"), "utf8").replace(/\n$/, "");
    expect(kept).toBe(want);
  });
});
