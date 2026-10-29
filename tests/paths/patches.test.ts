import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runPatch } from "../../src/core/patch/outcome";
import { patchExitCode, patchReportJson } from "../../src/core/patch/report";
import { parseScene } from "../../src/core/validate";
import { expectMatchesPatch, repoRoot, type PatchExpected } from "../helpers/fixtures";

const dir = join(repoRoot, "tests/fixtures/paths/patches");

interface PathPatch extends PatchExpected {
  readonly contains?: readonly string[];
}

function names(): string[] {
  return readdirSync(dir).filter((file) => file.endsWith(".patch")).map((file) => file.slice(0, -".patch".length)).sort();
}

describe("path patch fixtures (SPEC 12, 17)", () => {
  const fixtureNames = names();

  it("finds the 7 fixtures", () => {
    expect(fixtureNames).toHaveLength(7);
  });

  for (const name of fixtureNames) {
    it(`${name} gives its expected result`, () => {
      const expected = JSON.parse(readFileSync(join(dir, `${name}.expected.json`), "utf8")) as PathPatch;
      const scene = parseScene(readFileSync(join(repoRoot, expected.base), "utf8"));
      const outcome = runPatch(scene, readFileSync(join(dir, `${name}.patch`), "utf8"));
      expectMatchesPatch(patchReportJson(outcome), expected, name);
      expect(patchExitCode(outcome), `${name} exit`).toBe(expected.exit);
      for (const part of expected.contains ?? []) expect(outcome.error?.message, part).toContain(part);
    });
  }
});
