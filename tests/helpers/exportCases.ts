import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { parseScene } from "../../src/core/validate";
import type { Scene } from "../../src/core/types";
import { fixturesDir, repoRoot } from "./fixtures";

export const exportDir = join(fixturesDir, "export");

export interface ExportCase {
  readonly name: string;
  /** Path of the scene file from the repository root. */
  readonly scene: string;
  readonly genBbox: readonly { readonly args: readonly string[]; readonly file: string }[];
  readonly png: string | null;
}

export interface ExportCases {
  readonly tolerance: { readonly px: number; readonly norm1000: number; readonly pngChannel: number };
  readonly cases: readonly ExportCase[];
}

export function loadExportCases(): ExportCases {
  return JSON.parse(readFileSync(join(exportDir, "cases.json"), "utf8")) as ExportCases;
}

export function exportFilePath(file: string): string {
  return join(exportDir, file);
}

export function readExportText(file: string): string {
  return readFileSync(exportFilePath(file), "utf8");
}

export function readExportJson(file: string): unknown {
  return JSON.parse(readExportText(file));
}

export function caseScenePath(c: ExportCase): string {
  return join(repoRoot, c.scene);
}

export function loadCaseScene(c: ExportCase): Scene {
  return parseScene(readFileSync(caseScenePath(c), "utf8"));
}

/** The flags of a `gen-bbox` file: units and order, with the defaults of SPEC section 14. */
export function bboxOptions(args: readonly string[]): { units: "px" | "norm1000"; order: "xyxy" | "yxyx" } {
  const at = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i < 0 ? undefined : args[i + 1];
  };
  return { units: (at("--bbox-units") ?? "px") as "px" | "norm1000", order: (at("--bbox-order") ?? "xyxy") as "xyxy" | "yxyx" };
}

/**
 * Same JSON value: same keys in the same order, same strings and booleans, numbers within `tol`.
 * Plain data only (what `JSON.parse` returns).
 */
export function expectSameJson(actual: unknown, expected: unknown, tol: number, label: string): void {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), label).toBe(true);
    const list = actual as unknown[];
    expect(list.length, `${label} length`).toBe(expected.length);
    expected.forEach((e, i) => expectSameJson(list[i], e, tol, `${label}[${i}]`));
    return;
  }
  if (expected !== null && typeof expected === "object") {
    expect(actual !== null && typeof actual === "object" && !Array.isArray(actual), `${label} is an object`).toBe(true);
    const record = actual as Record<string, unknown>;
    const keys = Object.keys(expected);
    expect(Object.keys(record), `${label} keys`).toEqual(keys);
    for (const key of keys) expectSameJson(record[key], (expected as Record<string, unknown>)[key], tol, `${label}.${key}`);
    return;
  }
  if (typeof expected === "number") {
    expect(typeof actual, label).toBe("number");
    expect(Math.abs((actual as number) - expected), label).toBeLessThanOrEqual(tol);
    return;
  }
  expect(actual, label).toEqual(expected);
}

/** A raw scene without the parts that name objects, zones and lanes, so that a test can change those. */
export function withoutRules(raw: Record<string, any>): Record<string, any> {
  raw.checks = [];
  raw.relations = [];
  raw.assumptions = [];
  raw.states = {};
  return raw;
}
