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
export const patchesDir = join(fixturesDir, "patches");
export const compareDir = join(fixturesDir, "compare");

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

/** Deep comparison where numbers match within `tol`; everything else must be equal. */
export function near(actual: unknown, expected: unknown, tol: number, label: string): void {
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
    for (const key of ["pairs", "occluders", "accepted", "rejected"]) {
      if (key in exp) expect(act[key], `${tag} ${key}`).toEqual(exp[key]);
    }
    if (exp.check === "sort_consistency") {
      // SPEC 17: `status`, `value` and `ids` exactly, `worst` within the pixel tolerance, `positions` exactly.
      expect(act.value, `${tag} value is exact`).toBe(exp.value);
      if ("worst" in exp) near(act.worst, exp.worst, expected.tolerance.valuePx, `${tag} worst`);
      if ("positions" in exp) expect(act.positions, `${tag} positions`).toBe(exp.positions);
    }
    if ("message" in exp) expect(act.message, `${tag} message`).toBe(exp.message);
  });
}

/** Deep-cloned raw fixture object, for building invalid variants. */
export function rawFixture(name: string): Record<string, any> {
  return JSON.parse(readFixtureText(name)) as Record<string, any>;
}

export interface PatchExpected {
  readonly base: string;
  readonly tolerance: { readonly value: number; readonly valuePx: number; readonly coordinate: number };
  readonly exit: number;
  readonly status: "applied" | "rejected" | "invalid";
  readonly error: string | null;
  readonly locks: readonly string[];
  readonly diff: readonly Record<string, unknown>[];
  readonly checks: readonly { readonly id: string; readonly check: string; readonly from: string; readonly to: string; readonly value: readonly (number | null)[] }[];
  readonly failing: number | null;
}

/** Names of the patch fixtures (`tests/fixtures/patches/<name>.patch`), sorted. */
export function patchFixtureNames(): string[] {
  return readdirSync(patchesDir)
    .filter((f) => f.endsWith(".patch"))
    .map((f) => f.slice(0, -".patch".length))
    .sort();
}

export function patchFixturePath(name: string): string {
  return join(patchesDir, `${name}.patch`);
}

export function readPatchText(name: string): string {
  return readFileSync(patchFixturePath(name), "utf8");
}

export function loadPatchExpected(name: string): PatchExpected {
  return JSON.parse(readFileSync(join(patchesDir, `${name}.expected.json`), "utf8")) as PatchExpected;
}

/** The parts of a patch report that a patch fixture states, compared within the fixture's tolerance. */
export function expectMatchesPatch(
  report: {
    readonly status: string;
    readonly error: { readonly code: string } | null;
    readonly locks: readonly string[];
    readonly diff: readonly unknown[];
    readonly checks: readonly unknown[];
    readonly failing: number | null;
  },
  expected: PatchExpected,
  label: string,
): void {
  expect(report.status, `${label} status`).toBe(expected.status);
  expect(report.error?.code ?? null, `${label} error`).toBe(expected.error);
  expect(report.locks, `${label} locks`).toEqual(expected.locks);
  expect(report.failing, `${label} failing`).toBe(expected.failing);
  near(report.diff, expected.diff, expected.tolerance.coordinate, `${label} diff`);
  const actual = report.checks as readonly { id: string; check: string; from: string; to: string; value: readonly (number | null)[] }[];
  expect(actual.map((c) => [c.id, c.check, c.from, c.to]), `${label} check changes`).toEqual(
    expected.checks.map((c) => [c.id, c.check, c.from, c.to]),
  );
  expected.checks.forEach((c, i) => {
    const tol = c.check === "lane_reaches" ? expected.tolerance.valuePx : expected.tolerance.value;
    near(actual[i]?.value, c.value, tol, `${label} ${c.id} value`);
  });
}

export interface CompareExpected {
  readonly scene: string;
  readonly state: string;
  readonly variants: readonly { readonly name: string; readonly label: string | null }[];
  readonly failing: readonly number[];
  readonly locksTouched: readonly (readonly string[])[];
  readonly moved: readonly ({ readonly count: number; readonly distance: number } | null)[];
  readonly checks: readonly Record<string, any>[];
  readonly tolerance: { readonly value: number; readonly valuePx: number };
}

export function readCompareFile(name: string): string {
  return readFileSync(join(compareDir, name), "utf8");
}

export function loadCompareExpected(): CompareExpected {
  return JSON.parse(readCompareFile("yard.expected.json")) as CompareExpected;
}

/** The three `yard` variants of `tests/fixtures/compare/`, as `compare` receives them. */
export function yardVariants(): { name: string; text: string }[] {
  return ["A", "B", "C"].map((name) => ({ name, text: readCompareFile(`yard.${name}.patch`) }));
}

/** A `compare --format json` result against `yard.expected.json`, within its tolerance. */
export function expectMatchesCompare(actual: Record<string, any>, expected: CompareExpected): void {
  const tol = expected.tolerance.value;
  expect(actual.scene, "scene").toBe(expected.scene);
  expect(actual.state, "state").toBe(expected.state);
  expect(actual.variants, "variants").toEqual(expected.variants);
  expect(actual.failing, "failing").toEqual(expected.failing);
  expect(actual.locksTouched, "locksTouched").toEqual(expected.locksTouched);
  near(actual.moved, expected.moved, tol, "moved");
  expect(actual.checks.map((c: any) => c.id), "check ids").toEqual(expected.checks.map((c) => c.id));
  expected.checks.forEach((e, i) => {
    const a = actual.checks[i];
    const label = `check ${e.id}`;
    const valueTol = e.check === "lane_reaches" ? expected.tolerance.valuePx : tol;
    expect(a.check, label).toBe(e.check);
    expect(a.label, `${label} label`).toBe(e.label);
    near(a.threshold, e.threshold, 1e-9, `${label} threshold`);
    near(a.values, e.values, valueTol, `${label} values`);
    expect(a.status, `${label} status`).toEqual(e.status);
    near(a.delta, e.delta, valueTol, `${label} delta`);
  });
}

export const relationsDir = join(fixturesDir, "relations");
export const solverDir = join(fixturesDir, "solver");

export interface RelationsExpected {
  readonly scene: string;
  readonly tolerance: { readonly value: number };
  readonly results: readonly {
    readonly id: string;
    readonly rel: string;
    readonly hard: boolean;
    readonly status: string;
    readonly violation: number | null;
    readonly ids: readonly string[];
  }[];
}

export function relationsScenePath(): string {
  return join(relationsDir, "relations.scene.json");
}

export function loadRelationsScene(): Scene {
  return parseScene(readFileSync(relationsScenePath(), "utf8"));
}

export function loadRelationsExpected(): RelationsExpected {
  return JSON.parse(readFileSync(join(relationsDir, "relations.expected.json"), "utf8")) as RelationsExpected;
}

/** Relation results against `relations.expected.json`: every stated field, violations within its tolerance. */
export function expectMatchesRelations(results: readonly Record<string, unknown>[], expected: RelationsExpected): void {
  expect(results.map((r) => r.id), "relation ids").toEqual(expected.results.map((r) => r.id));
  expected.results.forEach((e, i) => {
    const a = results[i] as Record<string, unknown>;
    expect(a.rel, `${e.id} rel`).toBe(e.rel);
    expect(a.hard, `${e.id} hard`).toBe(e.hard);
    expect(a.status, `${e.id} status`).toBe(e.status);
    near(a.violation, e.violation, expected.tolerance.value, `${e.id} violation`);
    expect(a.ids, `${e.id} ids`).toEqual(e.ids);
  });
}

export interface SolverExpected {
  readonly scene: string;
  readonly only: readonly string[] | null;
  readonly status: "solved" | "conflict";
  readonly conflict: readonly string[];
  readonly hardViolated: readonly string[] | null;
  readonly maxSoftPenalty: number | null;
  readonly maxDistance: number | null;
  readonly unchanged: readonly string[];
  readonly referenceSoftPenalty: number;
  readonly referenceDistance: number;
}

/** Names of the solver fixtures (`tests/fixtures/solver/<name>.scene.json`), sorted. */
export function solverFixtureNames(): string[] {
  return readdirSync(solverDir)
    .filter((f) => f.endsWith(".scene.json"))
    .map((f) => f.slice(0, -".scene.json".length))
    .sort();
}

export function solverScenePath(name: string): string {
  return join(solverDir, `${name}.scene.json`);
}

export function loadSolverScene(name: string): Scene {
  return parseScene(readFileSync(solverScenePath(name), "utf8"));
}

export function loadSolverExpected(name: string): SolverExpected {
  return JSON.parse(readFileSync(join(solverDir, `${name}.expected.json`), "utf8")) as SolverExpected;
}
