import { describe, expect, it } from "vitest";
import { evaluateRelations } from "../../src/core/relations/evaluate";
import { serializeScene } from "../../src/core/serialize";
import { solveScene } from "../../src/core/solver/solve";
import { loadSolverExpected, loadSolverScene, solverFixtureNames } from "../helpers/fixtures";
import { expectConstraints } from "../helpers/solver";

describe("solver fixtures (core)", () => {
  const names = solverFixtureNames();

  it("finds the four fixtures", () => {
    expect(names).toEqual(["conflict", "feasible", "only", "perf"]);
  });

  for (const name of names) {
    it(`${name} meets its expected file`, () => {
      const expected = loadSolverExpected(name);
      const scene = loadSolverScene(name);
      const { report, proposal } = solveScene(scene, expected.only ?? undefined);
      expect(report.scene).toBe(expected.scene);
      expect(report.status).toBe(expected.status);
      expect(report.conflict).toEqual(expected.conflict);
      if (expected.hardViolated !== null) expect(report.hardViolated).toEqual(expected.hardViolated);
      if (expected.maxSoftPenalty !== null) expect(report.softPenalty).toBeLessThanOrEqual(expected.maxSoftPenalty);
      if (expected.maxDistance !== null) expect(report.distance).toBeLessThanOrEqual(expected.maxDistance);
      for (const id of expected.unchanged) {
        const index = scene.objects.findIndex((o) => o.id === id);
        expect(proposal.objects[index]?.pos, `${id} unchanged`).toEqual(scene.objects[index]?.pos);
      }
      if (expected.only !== null) {
        const allowed = new Set(expected.only);
        for (const m of report.moved) expect(allowed.has(m.id), `${m.id} is not in --only`).toBe(true);
      }
      if (report.status === "solved") expectConstraints(scene, proposal);
      // The report's relation results are those of the proposal.
      expect(report.relations).toEqual(evaluateRelations(proposal).results);
    });

    it(`${name} gives byte-identical output on a second run`, () => {
      const expected = loadSolverExpected(name);
      const run = () => solveScene(loadSolverScene(name), expected.only ?? undefined);
      const first = run();
      const second = run();
      expect(JSON.stringify(second.report)).toBe(JSON.stringify(first.report));
      expect(serializeScene(second.proposal)).toBe(serializeScene(first.proposal));
    });
  }

  it("solves perf in under 200 ms (median of 5 runs)", () => {
    const scene = loadSolverScene("perf");
    solveScene(scene);
    const times = [0, 1, 2, 3, 4].map(() => {
      const t0 = performance.now();
      solveScene(scene);
      return performance.now() - t0;
    });
    const median = [...times].sort((a, b) => a - b)[2] as number;
    console.log(`solve perf: median ${median.toFixed(1)} ms of ${times.map((t) => t.toFixed(1)).join(", ")}`);
    expect(median).toBeLessThan(200);
  });
});
