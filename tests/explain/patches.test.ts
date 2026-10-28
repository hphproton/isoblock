import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runPatch } from "../../src/core/patch/outcome";
import { patchExitCode, patchReportJson } from "../../src/core/patch/report";
import { parseScene } from "../../src/core/validate";
import { expectMatchesPatch, repoRoot, type PatchExpected } from "../helpers/fixtures";

const dir = join(repoRoot, "tests/fixtures/explain/patches");

interface ExplainPatch extends PatchExpected {
  readonly contains?: readonly string[];
}

function names(): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".patch"))
    .map((file) => file.slice(0, -".patch".length))
    .sort();
}

describe("explain patch fixtures (SPEC 12, 17)", () => {
  const fixtureNames = names();

  it("finds the 14 fixtures", () => {
    expect(fixtureNames).toHaveLength(14);
  });

  for (const name of fixtureNames) {
    it(`${name} gives its expected result`, () => {
      const expected = JSON.parse(readFileSync(join(dir, `${name}.expected.json`), "utf8")) as ExplainPatch;
      const scene = parseScene(readFileSync(join(repoRoot, expected.base), "utf8"));
      const outcome = runPatch(scene, readFileSync(join(dir, `${name}.patch`), "utf8"));
      expectMatchesPatch(patchReportJson(outcome), expected, name);
      expect(patchExitCode(outcome), `${name} exit`).toBe(expected.exit);
      for (const part of expected.contains ?? []) expect(outcome.error?.message, part).toContain(part);
    });
  }
});
