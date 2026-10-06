import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { checkExitCode, checkReportJson, formatCheckReport } from "../../src/core/report";
import type { CheckResult } from "../../src/core/types";
import { loadExpected, loadScene, fixtureNames } from "../helpers/fixtures";

const result = (status: CheckResult["status"]): CheckResult => ({
  id: "x", check: "no_overlap", status, value: 0, threshold: 0, ids: [], message: "m",
});

describe("check report", () => {
  it("prints a summary line, then one line per check", () => {
    const scene = loadScene("yard");
    const lines = formatCheckReport(scene, runChecks(scene)).split("\n");
    expect(lines[0]).toBe("scene yard: 9 checks, 6 pass, 3 fail, 0 warn, 0 skip");
    expect(lines).toHaveLength(10);
    expect(lines[1]).toMatch(/^PASS c1 in_region: /);
    expect(lines[4]).toMatch(/^FAIL c4 clearance: /);
    expect(lines[9]).toMatch(/^PASS c9 visible: /);
  });

  it("uses SKIP for checks that could not be evaluated", () => {
    const scene = loadScene("lane");
    const text = formatCheckReport(scene, runChecks(scene));
    expect(text.split("\n")[0]).toBe("scene lane: 7 checks, 2 pass, 3 fail, 0 warn, 2 skip");
    expect(text).toMatch(/\nSKIP c7 reachable: /);
  });

  it("reports a scene without checks", () => {
    const { checks: _checks, ...scene } = loadScene("yard");
    expect(formatCheckReport(scene, [])).toBe("scene yard: 0 checks");
  });

  it("builds the JSON shape of the expected files", () => {
    const scene = loadScene("yard");
    const json = checkReportJson(scene, runChecks(scene));
    expect(Object.keys(json)).toEqual(["scene", "results"]);
    expect(json.scene).toBe("yard");
    expect(json.results).toHaveLength(9);
    expect(Object.keys(json.results[0] as object)).toEqual(["id", "check", "status", "value", "threshold", "ids", "message"]);
  });

  it("writes result keys in one stable order", () => {
    const order = ["id", "check", "status", "value", "threshold", "ids", "pairs", "occluders", "message"];
    for (const name of fixtureNames()) {
      for (const r of runChecks(loadScene(name))) {
        const keys = Object.keys(r).map((k) => order.indexOf(k));
        expect(keys.every((k) => k >= 0), `${name}:${r.id}`).toBe(true);
        expect(keys, `${name}:${r.id}`).toEqual([...keys].sort((a, b) => a - b));
      }
    }
  });

  it("derives the exit code: fail or skip gives 1, pass and warn give 0", () => {
    expect(checkExitCode([result("pass"), result("warn")])).toBe(0);
    expect(checkExitCode([result("pass"), result("fail")])).toBe(1);
    expect(checkExitCode([result("pass"), result("skip")])).toBe(1);
    expect(checkExitCode([])).toBe(0);
  });

  it("gives every fixture the exit code its expected file implies", () => {
    for (const name of fixtureNames()) {
      const expected = loadExpected(name);
      const wantsOne = expected.results.some((r) => r.status === "fail" || r.status === "skip");
      expect(checkExitCode(runChecks(loadScene(name))), name).toBe(wantsOne ? 1 : 0);
    }
  });
});
