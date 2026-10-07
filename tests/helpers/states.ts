import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseScene } from "../../src/core/validate";
import type { Scene } from "../../src/core/types";
import type { ExpectedFile } from "./fixtures";
import { fixturesDir, repoRoot } from "./fixtures";

export const gameplayDir = join(fixturesDir, "gameplay");
export const statesDir = join(fixturesDir, "states");

export function walkScenePath(): string {
  return join(gameplayDir, "walk.scene.json");
}

export function loadWalk(): Scene {
  return parseScene(readFileSync(walkScenePath(), "utf8"));
}

export function loadWalkExpected(): ExpectedFile {
  return JSON.parse(readFileSync(join(gameplayDir, "walk.expected.json"), "utf8")) as ExpectedFile;
}

export interface StateCase {
  /** Path of the scene file from the repository root. */
  readonly scene: string;
  readonly state: string;
  /** Files in `tests/fixtures/states/`; `null` when the case has none. */
  readonly checks: string;
  readonly genBbox: string | null;
  readonly png: string | null;
}

export interface CompareCase {
  readonly scene: string;
  readonly state: string;
  readonly variants: readonly { readonly name: string; readonly file: string }[];
  readonly expected: { readonly json: string; readonly text: string; readonly md: string };
}

export interface StateCases {
  readonly cases: readonly StateCase[];
  readonly compare: readonly CompareCase[];
}

export function loadStateCases(): StateCases {
  return JSON.parse(readFileSync(join(statesDir, "cases.json"), "utf8")) as StateCases;
}

export function stateFilePath(file: string): string {
  return join(statesDir, file);
}

export function readStateText(file: string): string {
  return readFileSync(stateFilePath(file), "utf8");
}

export function readStateJson<T = any>(file: string): T {
  return JSON.parse(readStateText(file)) as T;
}

export function caseScenePath(c: { readonly scene: string }): string {
  return join(repoRoot, c.scene);
}

export function loadCaseScene(c: { readonly scene: string }): Scene {
  return parseScene(readFileSync(caseScenePath(c), "utf8"));
}

/** The expected check results of a state case: the file also names its `state`. */
export function loadStateExpected(c: StateCase): ExpectedFile & { readonly state: string } {
  return readStateJson(c.checks);
}
