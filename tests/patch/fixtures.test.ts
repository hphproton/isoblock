import { describe, expect, it } from "vitest";
import { patchExitCode, patchReportJson } from "../../src/core/patch/report";
import { runPatch } from "../../src/core/patch/outcome";
import { expectMatchesPatch, loadPatchExpected, loadScene, patchFixtureNames, readPatchText } from "../helpers/fixtures";

describe("patch fixtures (core)", () => {
  const names = patchFixtureNames();

  it("finds the 20 fixtures", () => {
    expect(names).toHaveLength(20);
  });

  for (const name of names) {
    it(`${name} gives its expected result`, () => {
      const expected = loadPatchExpected(name);
      const outcome = runPatch(loadScene(expected.base), readPatchText(name));
      expectMatchesPatch(patchReportJson(outcome), expected, name);
      expect(patchExitCode(outcome), `${name} exit`).toBe(expected.exit);
    });
  }
});
