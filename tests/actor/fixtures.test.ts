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

const root = join(repoRoot, "tests/fixtures/actor");
const file = JSON.parse(readFileSync(join(root, "cases.json"), "utf8")) as {
  tolerance: ExpectedFile["tolerance"];
  checks: readonly { scene: string; state: string | null; checks: readonly Record<string, unknown>[] }[];
  occluders: readonly {
    name: string;
    scene: string;
    state: string | null;
    lane: string;
    actor: readonly [number, number, number];
    step: number;
    parts: boolean;
    expected: Record<string, unknown>;
  }[];
};

function sceneOf(path: string): Scene {
  return parseScene(readFileSync(join(repoRoot, path), "utf8"));
}

/** `pairs` and `allowed` are present only when the expected result has them (SPEC 9.10, 17). */
function expectListed(results: readonly CheckResult[], expected: ExpectedFile): void {
  expected.results.forEach((exp, index) => {
    const act = results[index] as unknown as Record<string, unknown>;
    for (const key of ["pairs", "allowed"] as const) {
      if (key in exp) expect(act[key], `${exp.id as string} ${key}`).toEqual(exp[key]);
      else expect(act, `${exp.id as string} has no ${key}`).not.toHaveProperty(key);
    }
  });
}

/** The occluders JSON equals the expected object. Areas are already rounded to 2 decimals. */
function expectOccluders(actual: unknown, expected: unknown, path: string): void {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((item, index) => expectOccluders((actual as unknown[])[index], item, `${path}[${index}]`));
    return;
  }
  if (expected !== null && typeof expected === "object") {
    expect(Object.keys(actual as object), path).toEqual(Object.keys(expected));
    for (const key of Object.keys(expected)) {
      expectOccluders((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${path}.${key}`);
    }
    return;
  }
  expect(actual, path).toEqual(expected);
}

describe("actor fixtures (SPEC 9.10, 11.4, 17)", () => {
  for (const c of file.checks) {
    const label = `${c.scene} state ${c.state ?? "default"}`;

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
      expectListed(report.results, expected);
    }, 120_000);

    it(`${label}: the core matches the expected results`, () => {
      const scene = sceneOf(c.scene);
      const results = c.state === null ? runChecks(scene) : runChecksInState(scene, c.state);
      const expected: ExpectedFile = { scene: scene.id, tolerance: file.tolerance, results: c.checks };
      expectMatchesExpected(results, expected);
      expectListed(results, expected);
    }, 120_000);
  }

  for (const c of file.occluders) {
    it(`occluders ${c.name} matches the expected file`, () => {
      const args = [
        "occluders", "--json", join(repoRoot, c.scene), "--lane", c.lane,
        "--actor", c.actor.join(","), "--step", String(c.step),
      ];
      if (c.state !== null) args.push("--state", c.state);
      if (c.parts) args.push("--parts");
      const cap = memoryIo();
      expect(run(args, cap.io), cap.err()).toBe(0);
      expectOccluders(JSON.parse(cap.out()), c.expected, c.name);
    }, 60_000);
  }
});
