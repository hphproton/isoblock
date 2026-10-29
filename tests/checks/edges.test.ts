import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { parseScene } from "../../src/core/validate";
import { expectMatchesExpected, fixturesDir, readFixture, type ExpectedFile } from "../helpers/fixtures";

describe("edge fixture", () => {
  it("matches edges.expected.json", () => {
    const dir = join(fixturesDir, "edges");
    const scene = parseScene(readFileSync(join(dir, "edges.scene.json"), "utf8"));
    const expected = JSON.parse(readFixture("edges/edges.expected.json")) as ExpectedFile;
    expect(scene.id).toBe("edges");
    expectMatchesExpected(runChecks(scene), expected);
  });
});
