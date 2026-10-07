import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { runChecks } from "../../src/core/checks";
import { expectMatchesExpected } from "../helpers/fixtures";
import { memoryIo } from "../helpers/cli";
import { loadWalk, loadWalkExpected, walkScenePath } from "../helpers/states";

describe("gameplay fixture walk (SPEC 9.2)", () => {
  it("gives walk.expected.json in the core", () => {
    expectMatchesExpected(runChecks(loadWalk()), loadWalkExpected());
  });

  it("gives walk.expected.json through `check --json`", () => {
    const cap = memoryIo();
    expect(run(["check", walkScenePath(), "--json"], cap.io)).toBe(1);
    const report = JSON.parse(cap.out());
    expect(report.scene).toBe("walk");
    expectMatchesExpected(report.results, loadWalkExpected());
  });

  it("fixes the three messages of reachable", () => {
    const byId = new Map(runChecks(loadWalk()).map((r) => [r.id, r]));
    expect(byId.get("k2")?.message).toBe("no walkable path");
    expect(byId.get("k5")?.message).toBe("start is not on walkable ground");
    expect(byId.get("k6")?.message).toBe("target is not on walkable ground");
  });
});
