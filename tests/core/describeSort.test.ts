import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { checkLines } from "../../src/core/describeChecks";
import { loadSortCases, loadSortScene } from "../helpers/sort";

describe("describe: sort_consistency", () => {
  const scene = loadSortScene(loadSortCases().cases[0]!);
  const lines = checkLines(scene, runChecks(scene));

  it("prints one line per failing or skipped check, in the order of the checks, and none for a pass", () => {
    expect(lines.map((l) => l.split(" ").slice(0, 3).join(" "))).toEqual([
      "FAIL s1 sort_consistency",
      "FAIL s3 sort_consistency",
      "FAIL s4 sort_consistency",
      "FAIL s5 sort_consistency",
      "SKIP s6 sort_consistency:",
      "FAIL s7 sort_consistency",
      "FAIL s8 sort_consistency",
    ]);
  });

  it("names the objects out of order and the largest area drawn wrong", () => {
    expect(lines[0]).toBe("FAIL s1 sort_consistency shed, box, counter, kiosk: drawn out of order, worst 545.60 px2");
    expect(lines[3]).toBe("FAIL s5 sort_consistency shed, box: drawn out of order, worst 685.89 px2");
    expect(lines[5]).toBe("FAIL s7 sort_consistency box: drawn out of order, worst 155.88 px2");
  });

  it("explains a skip", () => {
    expect(lines[4]).toBe('SKIP s6 sort_consistency: zone "mark" has 0 points; an area needs 3 or more');
  });
});
