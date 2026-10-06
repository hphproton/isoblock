import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { parseScene } from "../../src/core/validate";
import type { CheckResult, Scene } from "../../src/core/types";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, "..", "..");
export const fixturesDir = join(repoRoot, "tests", "fixtures");
export const goldenDir = join(repoRoot, "tests", "golden");

export interface ExpectedFile {
  readonly scene: string;
  readonly tolerance: { readonly value: number; readonly valuePx: number };
  readonly results: readonly Record<string, unknown>[];
}

export function fixtureNames(): string[] {
  return readdirSync(fixturesDir)
    .filter((f) => f.endsWith(".scene.json"))
    .map((f) => f.slice(0, -".scene.json".length))
    .sort();
}

export function fixturePath(name: string): string {
  return join(fixturesDir, `${name}.scene.json`);
}

export function readFixtureText(name: string): string {
  return readFileSync(fixturePath(name), "utf8");
}

export function loadScene(name: string): Scene {
  return parseScene(readFixtureText(name));
}

export function loadExpected(name: string): ExpectedFile {
  const text = readFileSync(join(fixturesDir, `${name}.expected.json`), "utf8");
  return JSON.parse(text) as ExpectedFile;
}

function near(actual: unknown, expected: unknown, tol: number, label: string): void {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), label).toBe(true);
    const list = actual as unknown[];
    expect(list.length, label).toBe(expected.length);
    expected.forEach((e, i) => near(list[i], e, tol, `${label}[${i}]`));
    return;
  }
  if (expected === null || typeof expected !== "number") {
    expect(actual, label).toEqual(expected);
    return;
  }
  expect(typeof actual, label).toBe("number");
  expect(Math.abs((actual as number) - expected), label).toBeLessThanOrEqual(tol);
}

/** Compare results with an expected file within the SPEC 9.1 tolerance. */
export function expectMatchesExpected(
  results: readonly CheckResult[],
  expected: ExpectedFile,
  only?: readonly string[],
): void {
  const wanted = expected.results.filter((r) => !only || only.includes(r.check as string));
  const actual = results.filter((r) => !only || only.includes(r.check));
  expect(actual.map((r) => r.id)).toEqual(wanted.map((r) => r.id));
  wanted.forEach((exp, i) => {
    const act = actual[i] as unknown as Record<string, unknown>;
    const tag = `${expected.scene}:${exp.id as string}`;
    const tol = exp.check === "lane_reaches" ? expected.tolerance.valuePx : expected.tolerance.value;
    expect(act.check, tag).toBe(exp.check);
    expect(act.status, `${tag} status`).toBe(exp.status);
    near(act.value, exp.value, tol, `${tag} value`);
    near(act.threshold, exp.threshold, 1e-9, `${tag} threshold`);
    expect(act.ids, `${tag} ids`).toEqual(exp.ids);
    for (const key of ["pairs", "occluders"]) {
      if (key in exp) expect(act[key], `${tag} ${key}`).toEqual(exp[key]);
    }
    if ("message" in exp) expect(act.message, `${tag} message`).toBe(exp.message);
  });
}

/** Deep-cloned raw fixture object, for building invalid variants. */
export function rawFixture(name: string): Record<string, any> {
  return JSON.parse(readFixtureText(name)) as Record<string, any>;
}
