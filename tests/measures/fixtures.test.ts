import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { runChecks } from "../../src/core/checks";
import { runChecksInState } from "../../src/core/checks/inState";
import { checkLines } from "../../src/core/describeChecks";
import type { CheckResult, Scene } from "../../src/core/types";
import { parseScene } from "../../src/core/validate";
import { expectMatchesExpected, repoRoot, type ExpectedFile } from "../helpers/fixtures";
import { memoryIo } from "../helpers/cli";

interface MeasureCase {
  readonly scene: string;
  readonly state: string | null;
  readonly checks: readonly Record<string, unknown>[];
}

const file = JSON.parse(readFileSync(join(repoRoot, "tests/fixtures/measures/cases.json"), "utf8")) as {
  readonly tolerance: ExpectedFile["tolerance"];
  readonly cases: readonly MeasureCase[];
};

function sceneOf(c: MeasureCase): Scene {
  return parseScene(readFileSync(join(repoRoot, c.scene), "utf8"));
}

function expectedOf(c: MeasureCase): ExpectedFile {
  return { scene: sceneOf(c).id, tolerance: file.tolerance, results: c.checks };
}

function resultsOf(c: MeasureCase): readonly CheckResult[] {
  const scene = sceneOf(c);
  return c.state === null ? runChecks(scene) : runChecksInState(scene, c.state);
}

describe("measure fixtures (SPEC 9.4, 17)", () => {
  for (const c of file.cases) {
    const label = `${c.scene} state ${c.state ?? "default"}`;

    it(`${label}: the core matches the expected results`, () => {
      expectMatchesExpected(resultsOf(c), expectedOf(c));
    });

    it(`${label}: check --json matches the expected results`, () => {
      const args = ["check", join(repoRoot, c.scene), "--json"];
      if (c.state !== null) args.push("--state", c.state);
      const cap = memoryIo();
      const code = run(args, cap.io);
      const report = JSON.parse(cap.out()) as { scene: string; results: CheckResult[] };
      const expected = expectedOf(c);
      expect(code).toBe(expected.results.some((r) => r.status === "fail" || r.status === "skip") ? 1 : 0);
      expect(report.scene).toBe(expected.scene);
      expect(report).not.toHaveProperty("state");
      expectMatchesExpected(report.results, expected);
    });
  }

  it("prints the drawn region, the height and lane_apart in describe", () => {
    const scene = sceneOf(file.cases[0] as MeasureCase);
    const lines = checkLines(scene, runChecks(scene));
    expect(lines).toContain("FAIL drawn in_region tower: outside view");
    expect(lines).toContain("FAIL size_height min_screen_size tower: 192 px tall < 200 px");
    expect(lines).toContain("FAIL size_person min_screen_size person: 28.8 px tall < 30 px");
    expect(lines).toContain("FAIL walks_near lane_apart walk1\u00d7walk2: 0.30 < 0.50");
    expect(lines).toContain("FAIL walks_cross lane_apart walk1\u00d7walk3: overlap 0.60");
    expect(lines).toContain("FAIL on_plaza lane_apart walk1\u00d7plaza: overlap 0.30");
    expect(lines).toContain('SKIP diag_shape lane_apart: lane "diag" is not parallel to u or v; only axis-parallel lanes are supported');
    expect(lines).toContain('SKIP no_points lane_apart: zone "mark" has 0 points; a zone needs 3 or more');
  });
});
