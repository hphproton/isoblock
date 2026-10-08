import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseScene } from "../../src/core/validate";
import type { Scene } from "../../src/core/types";
import { fixturesDir, repoRoot } from "./fixtures";

export const runtimeDir = join(fixturesDir, "runtime");

export interface RuntimeCase {
  readonly name: string;
  /** Path of the scene file from the repository root. */
  readonly scene: string;
  /** File name in `tests/fixtures/runtime/`. */
  readonly runtime: string;
}

export interface RuntimeCases {
  readonly tolerance: { readonly world: number };
  readonly cases: readonly RuntimeCase[];
}

export function loadRuntimeCases(): RuntimeCases {
  return JSON.parse(readFileSync(join(runtimeDir, "cases.json"), "utf8")) as RuntimeCases;
}

export function readRuntimeJson(file: string): unknown {
  return JSON.parse(readFileSync(join(runtimeDir, file), "utf8"));
}

export function runtimeScenePath(c: RuntimeCase): string {
  return join(repoRoot, c.scene);
}

export function loadRuntimeScene(c: RuntimeCase): Scene {
  return parseScene(readFileSync(runtimeScenePath(c), "utf8"));
}
