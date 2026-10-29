import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { runChecks } from "../../src/core/checks";
import { runChecksInState } from "../../src/core/checks/inState";
import { evaluateRelations } from "../../src/core/relations/evaluate";
import type { CheckResult, Scene } from "../../src/core/types";
import { parseScene } from "../../src/core/validate";
import { memoryIo } from "../helpers/cli";
import { expectMatchesExpected, expectMatchesRelations, repoRoot, type ExpectedFile, type RelationsExpected } from "../helpers/fixtures";

const root = join(repoRoot, "tests/fixtures/paths");
const file = JSON.parse(readFileSync(join(root, "cases.json"), "utf8")) as {
  tolerance: ExpectedFile["tolerance"] & { area: number };
  checks: readonly { scene: string; state: string | null; checks: readonly Record<string, unknown>[] }[];
  relations: { scene: string; results: RelationsExpected["results"] };
  occluders: readonly {
    name: string;
    scene: string;
    state: string | null;
    lane: string;
    actor: readonly [number, number, number];
    step: number;
    expected: Record<string, unknown>;
  }[];
};

function sceneOf(path: string): Scene {
  return parseScene(readFileSync(join(repoRoot, path), "utf8"));
}

function near(actual: unknown, expected: unknown, path: string): void {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((item, index) => near((actual as unknown[])[index], item, `${path}[${index}]`));
    return;
  }
  if (expected !== null && typeof expected === "object") {
    expect(Object.keys(actual as object), path).toEqual(Object.keys(expected));
    for (const key of Object.keys(expected)) {
      near((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${path}.${key}`);
    }
    return;
  }
  if (typeof expected === "number" && path.endsWith("area") && !path.endsWith(".area.level")) {
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(file.tolerance.area);
    return;
  }
  expect(actual, path).toEqual(expected);
}

describe("path fixtures (SPEC 9.8, 17)", () => {
  for (const c of file.checks) {
    const label = `${c.scene} state ${c.state ?? "default"}`;
    const expected: ExpectedFile = { scene: sceneOf(c.scene).id, tolerance: file.tolerance, results: c.checks };

    it(`${label}: check --json matches the expected results`, () => {
      const args = ["check", "--json", join(repoRoot, c.scene)];
      if (c.state !== null) args.push("--state", c.state);
      const cap = memoryIo();
      const code = run(args, cap.io);
      const report = JSON.parse(cap.out()) as { scene: string; results: CheckResult[] };
      expect(code).toBe(c.checks.some((row) => row.status === "fail" || row.status === "skip") ? 1 : 0);
      expect(report.scene).toBe(expected.scene);
      expectMatchesExpected(report.results, expected);
    });

    it(`${label}: the core matches the expected results`, () => {
      const scene = sceneOf(c.scene);
      const results = c.state === null ? runChecks(scene) : runChecksInState(scene, c.state);
      expectMatchesExpected(results, expected);
    });
  }

  it("relations --json matches the expected results", () => {
    const scene = sceneOf(file.relations.scene);
    const expected: RelationsExpected = { scene: scene.id, tolerance: { value: file.tolerance.value }, results: file.relations.results };
    expectMatchesRelations(evaluateRelations(scene).results as unknown as Record<string, unknown>[], expected);
    const cap = memoryIo();
    expect(run(["relations", "--json", join(repoRoot, file.relations.scene)], cap.io)).toBe(0);
    const report = JSON.parse(cap.out()) as { scene: string; results: Record<string, unknown>[] };
    expect(report.scene).toBe(scene.id);
    expectMatchesRelations(report.results, expected);
  });

  for (const c of file.occluders) {
    it(`occluders ${c.name} matches the expected file`, () => {
      const args = ["occluders", "--json", join(repoRoot, c.scene), "--lane", c.lane, "--actor", c.actor.join(","), "--step", String(c.step)];
      if (c.state !== null) args.push("--state", c.state);
      const cap = memoryIo();
      expect(run(args, cap.io), cap.err()).toBe(0);
      near(JSON.parse(cap.out()), c.expected, c.name);
    });
  }
});
