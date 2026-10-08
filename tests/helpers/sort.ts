import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Box, Rect } from "../../src/core/geometry";
import type { Camera, Scene } from "../../src/core/types";
import { parseScene } from "../../src/core/validate";
import { fixturesDir, goldenDir, repoRoot } from "./fixtures";

export const sortDir = join(fixturesDir, "sort");

export interface SortCase {
  /** Path of the scene file from the repository root. */
  readonly scene: string;
  /** The state to check in, or `null` for the scene as it is. */
  readonly state: string | null;
  /** File name in `tests/fixtures/sort/`. */
  readonly checks: string;
}

export interface SortCompareCase {
  readonly scene: string;
  readonly state: string | null;
  readonly variants: readonly { readonly name: string; readonly file: string }[];
  readonly expected: { readonly json: string; readonly text: string; readonly md: string };
}

export interface SortCases {
  readonly cases: readonly SortCase[];
  readonly compare: readonly SortCompareCase[];
}

export function loadSortCases(): SortCases {
  return JSON.parse(readFileSync(join(sortDir, "cases.json"), "utf8")) as SortCases;
}

export function readSortText(file: string): string {
  return readFileSync(join(sortDir, file), "utf8");
}

export function readSortJson<T = any>(file: string): T {
  return JSON.parse(readSortText(file)) as T;
}

export function sortFilePath(file: string): string {
  return join(sortDir, file);
}

export function sortScenePath(c: { readonly scene: string }): string {
  return join(repoRoot, c.scene);
}

export function loadSortScene(c: { readonly scene: string }): Scene {
  return parseScene(readFileSync(sortScenePath(c), "utf8"));
}

/** The arguments of `--state`, empty for the scene as it is. */
export function stateArgs(state: string | null): string[] {
  return state === null ? [] : ["--state", state];
}

export interface GoldenSort {
  readonly tolerance: number;
  readonly keys: readonly { readonly camera: Camera; readonly footprint: readonly number[]; readonly key: number }[];
  readonly slices: readonly {
    readonly name: string;
    readonly camera: Camera;
    readonly footprint: readonly number[];
    readonly parts: readonly { readonly id: string; readonly box: readonly number[]; readonly order: number }[];
    readonly sprites: readonly unknown[];
  }[];
}

export function loadGoldenSort(): GoldenSort {
  return JSON.parse(readFileSync(join(goldenDir, "sort.json"), "utf8")) as GoldenSort;
}

export function rectOf([u0, v0, u1, v1]: readonly number[]): Rect {
  return { u0: u0 as number, v0: v0 as number, u1: u1 as number, v1: v1 as number };
}

export function boxOf([u0, v0, h0, u1, v1, h1]: readonly number[]): Box {
  return { u0: u0 as number, v0: v0 as number, h0: h0 as number, u1: u1 as number, v1: v1 as number, h1: h1 as number };
}
