import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runPatch } from "../../src/core/patch/outcome";
import { patchExitCode, patchReportJson } from "../../src/core/patch/report";
import { parseScene } from "../../src/core/validate";
import { expectMatchesPatch, loadScene, repoRoot, type PatchExpected } from "../helpers/fixtures";

const dir = join(repoRoot, "tests", "fixtures", "hide");

function names(): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".patch"))
    .map((f) => f.slice(0, -".patch".length))
    .sort();
}

describe("hide and show fixtures", () => {
  const fixtureNames = names();

  it("finds the 7 fixtures", () => {
    expect(fixtureNames).toHaveLength(7);
  });

  for (const name of fixtureNames) {
    it(`${name} gives its expected result`, () => {
      const expected = JSON.parse(readFileSync(join(dir, `${name}.expected.json`), "utf8")) as PatchExpected;
      const scene = parseScene(readFileSync(join(repoRoot, expected.base), "utf8"));
      const outcome = runPatch(scene, readFileSync(join(dir, `${name}.patch`), "utf8"));
      expectMatchesPatch(patchReportJson(outcome), expected, name);
      expect(patchExitCode(outcome), `${name} exit`).toBe(expected.exit);
    });
  }
});

describe("hide and show messages", () => {
  const yard = loadScene("yard");

  it("suggests an object and a state within two edits, and checks the object first", () => {
    const object = runPatch(yard, "hide closed crat1\n");
    expect(object.error?.message).toMatch(/unknown object "crat1".*did you mean "crate1"/);
    const state = runPatch(yard, "show closd bench\n");
    expect(state.error?.message).toMatch(/unknown state "closd".*did you mean "closed"/);
    const both = runPatch(yard, "show night crat1\n");
    expect(both.error?.message).toMatch(/unknown object "crat1"/);
    expect(both.error?.message).not.toMatch(/unknown state/);
  });

  it("refuses a second hide and a show of an object that is not hidden", () => {
    expect(runPatch(yard, "hide closed bench\n").error?.message).toMatch(/already hidden/);
    expect(runPatch(yard, "show closed crate1\n").error?.message).toMatch(/not hidden/);
  });
});
