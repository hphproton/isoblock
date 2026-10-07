import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { checkLines, } from "../../src/core/describeChecks";
import { describeScene } from "../../src/core/describe";
import { loadWalk } from "../helpers/states";

describe("describe: the gameplay checks", () => {
  const scene = loadWalk();
  const lines = checkLines(scene, runChecks(scene));

  it("prints one line per failing check, in the order of the checks, and none for a pass", () => {
    expect(lines.map((l) => l.split(" ").slice(0, 3).join(" "))).toEqual([
      "FAIL k2 reachable",
      "FAIL k3 reachable",
      "FAIL k5 reachable",
      "FAIL k6 reachable",
      "FAIL s1 capacity",
    ]);
  });

  it("names the objects and the reason", () => {
    expect(lines[0]).toBe("FAIL k2 reachable table1: no walkable path");
    expect(lines[1]).toBe("FAIL k3 reachable bench2: path of 3.10 u (max 1.00)");
    expect(lines[3]).toBe("FAIL k6 reachable path: target is not on walkable ground");
    expect(lines[4]).toBe("FAIL s1 capacity seat: 4 usable < 6");
  });

  it("prints a failing min_screen_size and the blocked anchors of a failing capacity", () => {
    const failing = {
      ...scene,
      checks: [
        { id: "m", check: "min_screen_size", target: "walker1", min: 200 },
        { id: "s", check: "capacity", kind: "seat", min: 7, ids: ["table1", "table2"] },
      ],
    };
    expect(checkLines(failing, runChecks(failing))).toEqual([
      "FAIL m min_screen_size walker1: 126 px < 200 px",
      "FAIL s capacity seat: 6 usable < 7 (blocked: table1/s2, table2/s3)",
    ]);
  });

  it("is part of describe", () => {
    expect(describeScene(scene, runChecks(scene))).toContain("FAIL k3 reachable bench2: path of 3.10 u (max 1.00)");
  });
});
