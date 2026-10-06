import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { runPatch } from "../../src/core/patch/outcome";
import { formatSolveReport, offsetText, solveExitCode, solvePatch, solveReportJson } from "../../src/core/solver/report";
import { solveScene } from "../../src/core/solver/solve";
import type { Scene } from "../../src/core/types";
import { validateScene } from "../../src/core/validate";
import { loadSolverExpected, loadSolverScene, solverFixtureNames } from "../helpers/fixtures";
import { box, flatScene } from "../helpers/scene";
import { expectConstraints, onGrid } from "../helpers/solver";

/** Flat camera: screen = (10u, 10v), view 0..10 units on both axes. */
function scene(objects: unknown[], relations: unknown[], extra: Record<string, unknown> = {}): Scene {
  return validateScene(flatScene({ objects, relations, ...extra }));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const posOf = (s: Scene, id: string) => s.objects.find((o) => o.id === id)?.pos;

describe("solveScene: what may move", () => {
  it("moves a free object to meet a hard relation, on the 0.05 grid", () => {
    const s = scene([{ ...box("a", [1, 1]), locks: ["pos"] }, box("b", [6.013, 1])], [
      { id: "r", a: "b", rel: "gap", b: "a", gap: [0.5, 1], hard: true },
    ]);
    const { report, proposal } = solveScene(s);
    expect(report.status).toBe("solved");
    expect(report.hardViolated).toEqual([]);
    expect(report.conflict).toEqual([]);
    expectConstraints(s, proposal);
    // The nearest position with a gap of 0.5 to 1 on the grid: u = 3.
    expect(posOf(proposal, "b")).toEqual([3, 1]);
    expect(onGrid(3)).toBe(true);
    expect(report.moved).toEqual([{ id: "b", from: [6.013, 1], to: [3, 1] }]);
    expect(report.distance).toBeCloseTo(3.013, 9);
  });

  it("keeps the exact value of a coordinate it does not change", () => {
    const objects = [{ ...box("a", [5, 1.013]), locks: ["pos"] }, { ...box("b", [6.02, 1.013]), locks: ["pos.v"] }];
    const { report, proposal } = solveScene(scene(objects, [{ id: "r", a: "b", rel: "left_of", b: "a", hard: true }]));
    expect(report.status).toBe("solved");
    expect(posOf(proposal, "b")?.[1]).toBe(1.013);
    expect(posOf(proposal, "b")?.[0]).toBe(4);
  });

  it("never moves an object with a pos lock, and moves a pos.u lock along v only", () => {
    const objects = [
      { ...box("a", [1, 1]), locks: ["pos"] },
      { ...box("b", [6, 6]), locks: ["pos.u"] },
    ];
    const s = scene(objects, [{ id: "r", a: "b", rel: "aligned", b: "a", axis: "v", hard: true }]);
    const { report, proposal } = solveScene(s);
    expect(report.status).toBe("solved");
    expect(posOf(proposal, "a")).toEqual([1, 1]);
    expect(posOf(proposal, "b")).toEqual([6, 1]);
  });

  it("treats a pointer lock on a position as a lock of that coordinate", () => {
    const objects = [{ ...box("a", [1, 1]), locks: ["pos", "/objects/1/pos/0"] }, box("b", [1.5, 6])];
    const s = scene(objects, [{ id: "r", a: "b", rel: "gap", b: "a", gap: [0, 0.5], hard: true }]);
    const { report, proposal } = solveScene(s);
    expect(report.status).toBe("solved");
    // b keeps u = 1.5 and moves along v to the nearest gap of 0.5.
    expect(posOf(proposal, "b")).toEqual([1.5, 2.5]);
    const container = scene([{ ...box("a", [1, 1]), locks: ["pos", "/objects/1"] }, box("b", [1.5, 6])], s.relations as unknown[]);
    expect(solveScene(container).report).toMatchObject({ status: "conflict", conflict: ["r"], moved: [] });
  });

  it("moves only the objects in only, and rejects unknown ids (E_USAGE)", () => {
    const s = scene([box("a", [1, 1]), box("b", [6, 6]), box("c", [8, 1])], [
      { id: "r1", a: "b", rel: "gap", b: "a", gap: [0, 0.5], hard: true },
      { id: "r2", a: "c", rel: "gap", b: "a", gap: [0, 0.5], hard: true },
    ]);
    const { report, proposal } = solveScene(s, ["b"]);
    expect(report.status).toBe("conflict");
    expect(report.conflict).toEqual(["r2"]);
    expect(posOf(proposal, "c")).toEqual([8, 1]);
    expect(posOf(proposal, "a")).toEqual([1, 1]);
    expect(() => solveScene(s, ["b", "ghost"])).toThrowError(/ghost/);
    try {
      solveScene(s, ["ghost"]);
    } catch (e) {
      expect((e as { code: string }).code).toBe("E_USAGE");
    }
  });

  it("never changes the input scene", () => {
    const s = deepFreeze(scene([box("a", [1, 1]), box("b", [6, 6])], [{ id: "r", a: "b", rel: "gap", b: "a", gap: [0, 0.5], hard: true }]));
    expect(() => solveScene(s)).not.toThrow();
    expect(posOf(s, "b")).toEqual([6, 6]);
  });
});

describe("solveScene: constraints and conflicts", () => {
  it("keeps a moved footprint inside the view region", () => {
    // The strip edge at v = 20 lies outside the view (v up to 10): the relation cannot be met.
    const s = scene([box("a", [1, 1])], [{ id: "r", a: "a", rel: "against", b: "strip:far.v0", hard: true }], {
      strips: [{ id: "far", v: [20, null] }],
    });
    const { report, proposal } = solveScene(s);
    expect(report.status).toBe("conflict");
    expect(report.conflict).toEqual(["r"]);
    expectConstraints(s, proposal);
  });

  it("does not let a moved footprint overlap another, unless the two overlapped before", () => {
    const fixed = { ...box("wall", [4, 0]), locks: ["pos"] };
    const a = (u: number) => ({ ...box("a", [u, 0.5]), locks: ["pos.v"] });
    const s = scene([fixed, a(2)], [{ id: "r", a: "a", rel: "aligned", b: "wall", axis: "u", hard: true }]);
    expect(solveScene(s).report.status).toBe("conflict");
    const before = scene([fixed, a(4.5)], [{ id: "r", a: "a", rel: "aligned", b: "wall", axis: "u", hard: true }]);
    const { report, proposal } = solveScene(before);
    expect(report.status).toBe("solved");
    expect(posOf(proposal, "a")).toEqual([4, 0.5]);
  });

  it("finds no solution that moves an object when every region blocks the scene", () => {
    const frame = { frame: { w: 100, h: 100, regions: [{ id: "hud", rect: [0, 0, 100, 100], blocksScene: true }] } };
    const s = scene([box("a", [1, 1]), box("b", [6, 6])], [{ id: "r", a: "b", rel: "gap", b: "a", gap: [0, 0.5], hard: true }], frame);
    expect(solveScene(s).report).toMatchObject({ status: "conflict", conflict: ["r"] });
    expect(solveScene(scene([box("a", [1, 1])], [], frame)).report.status).toBe("solved");
  });

  it("reports a hard relation between locked objects as the conflict set", () => {
    const objects = [{ ...box("a", [1, 1]), locks: ["pos"] }, { ...box("b", [6, 6]), locks: ["pos"] }, box("c", [3, 3])];
    const s = scene(objects, [
      { id: "ok", a: "c", rel: "gap", b: "a", gap: [0, 1], hard: true },
      { id: "bad", a: "b", rel: "gap", b: "a", gap: [0, 1], hard: true },
    ]);
    const { report } = solveScene(s);
    expect([report.status, report.conflict, report.hardViolated]).toEqual(["conflict", ["bad"], ["bad"]]);
  });

  it("ignores a skipped hard relation and solves a scene without relations", () => {
    const s = scene([box("a", [1, 1]), box("b", [6, 6])], [{ id: "f", a: "a", rel: "facing", b: "b", hard: true }]);
    const { report } = solveScene(s);
    expect([report.status, report.hardViolated, report.moved, report.distance]).toEqual(["solved", [], [], 0]);
    expect(report.relations[0]?.status).toBe("skip");
    expect(solveScene(scene([box("a", [1, 1])], [])).report).toMatchObject({ status: "solved", moved: [], softPenalty: 0 });
  });

  it("lowers the soft penalty once the hard relations hold", () => {
    const s = scene([{ ...box("a", [1, 1]), locks: ["pos"] }, box("b", [6, 6])], [
      { id: "h", a: "b", rel: "gap", b: "a", gap: [0, 3], hard: true },
      { id: "s", a: "b", rel: "aligned", b: "a", axis: "v" },
    ]);
    const { report } = solveScene(s);
    expect([report.status, report.softPenalty]).toEqual(["solved", 0]);
  });
});

describe("solve report, patch and exit code", () => {
  const s = scene([{ ...box("a", [1, 1]), locks: ["pos"] }, box("b", [6, 6.013])], [{ id: "h", a: "b", rel: "gap", b: "a", gap: [0, 0.5], hard: true }], {
    checks: [{ id: "c1", check: "no_overlap" }],
  });

  it("gives the JSON keys in the order of SPEC section 8", () => {
    expect(Object.keys(solveReportJson(solveScene(s).report))).toEqual([
      "scene", "status", "hardViolated", "softPenalty", "distance", "moved", "conflict", "relations",
    ]);
  });

  it("prints solve <scene id>: solved|conflict, then one line per moved object", () => {
    const { report } = solveScene(s);
    const lines = formatSolveReport(report).split("\n");
    expect(lines[0]).toBe("solve synthetic: solved");
    expect(lines[1]).toMatch(/^move b 6,6\.013 -> [\d.]+,[\d.]+$/);
    expect(lines).toContain("hard violated: none");
  });

  it("writes offsets in plain decimals with a sign", () => {
    expect(offsetText(0.35)).toBe("+0.35");
    expect(offsetText(-1)).toBe("-1");
    expect(offsetText(1e-7)).toBe("+0.0000001");
    expect(offsetText(-0.013000000000000012)).toBe("-0.013");
  });

  it("writes a patch that patch applies to the same positions", () => {
    const { report, proposal } = solveScene(s);
    const text = solvePatch(report);
    expect(text.startsWith("# solve proposal\nmove b ")).toBe(true);
    const outcome = runPatch(s, text);
    expect(outcome.status).toBe("applied");
    expect(outcome.result?.objects.map((o) => o.pos)).toEqual(proposal.objects.map((o) => o.pos));
  });

  it("leaves out an axis without an offset", () => {
    const one = scene([{ ...box("a", [1, 1]), locks: ["pos"] }, { ...box("b", [6, 1]), locks: ["pos.v"] }], [
      { id: "h", a: "b", rel: "gap", b: "a", gap: [0, 0.5], hard: true },
    ]);
    expect(solvePatch(solveScene(one).report)).toMatch(/^# solve proposal\nmove b u-[\d.]+\n$/);
  });

  it("exits 0 when solved and every check passes, else 1", () => {
    const { report, proposal } = solveScene(s);
    expect(solveExitCode(report, runChecks(proposal))).toBe(0);
    const failing = [{ id: "x", check: "c", status: "fail" as const, value: 1, threshold: 0, ids: [], message: "" }];
    expect(solveExitCode(report, failing)).toBe(1);
    expect(solveExitCode({ ...report, status: "conflict" }, [])).toBe(1);
  });
});

describe("solver fixtures: the --patch output", () => {
  for (const name of solverFixtureNames()) {
    it(`${name}: patch applies the proposal`, () => {
      const base = loadSolverScene(name);
      const { report, proposal } = solveScene(base, loadSolverExpected(name).only ?? undefined);
      const outcome = runPatch(base, solvePatch(report));
      expect(outcome.status).toBe("applied");
      expect(outcome.result?.objects.map((o) => o.pos)).toEqual(proposal.objects.map((o) => o.pos));
    });
  }
});
