import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/cli/args";
import { run } from "../../src/cli/run";
import { serializeScene } from "../../src/core/serialize";
import { memoryIo } from "../helpers/cli";
import {
  expectMatchesRelations,
  fixturePath,
  loadRelationsExpected,
  loadSolverExpected,
  relationsScenePath,
  solverScenePath,
} from "../helpers/fixtures";

function exec(argv: string[], files: Record<string, string> = {}) {
  const cap = memoryIo(files);
  const code = run(argv, cap.io);
  return { code, out: cap.out(), err: cap.err(), files: cap.files };
}

const relationsText = readFileSync(relationsScenePath(), "utf8");
const solverText = (name: string) => readFileSync(solverScenePath(name), "utf8");

describe("parseArgs: relations and solve", () => {
  it("parses relations with --json", () => {
    expect(parseArgs(["relations", "a.json", "--json"])).toEqual({ kind: "run", command: "relations", file: "a.json", json: true });
  });

  it("parses solve with --only, -o, --patch and --json", () => {
    expect(parseArgs(["solve", "a.json"])).toEqual({ kind: "solve", file: "a.json", json: false });
    expect(parseArgs(["solve", "a.json", "--only", "b, c,b", "-o", "p.json", "--patch=m.patch", "--json"])).toEqual({
      kind: "solve", file: "a.json", json: true, only: ["b", "c"], output: "p.json", patchOutput: "m.patch",
    });
  });

  it("rejects an empty --only entry and flags of other commands", () => {
    for (const argv of [["solve", "a.json", "--only", "a,,b"], ["solve", "a.json", "--dry-run"], ["relations", "a.json", "-o", "x.json"], ["patch", "a.json", "p", "--only", "a"]]) {
      expect(() => parseArgs(argv), argv.join(" ")).toThrowError();
    }
  });
});

describe("cli: relations", () => {
  it("prints the results as JSON and exits 1 when a hard relation is violated", () => {
    const r = exec(["relations", "r.json", "--json"], { "r.json": relationsText });
    expect(r.code).toBe(1);
    const json = JSON.parse(r.out);
    expect(Object.keys(json)).toEqual(["scene", "results"]);
    expectMatchesRelations(json.results, loadRelationsExpected());
  });

  it("prints a summary line and one line per relation", () => {
    const r = exec(["relations", "r.json"], { "r.json": relationsText });
    const lines = r.out.trimEnd().split("\n");
    expect(lines).toHaveLength(23);
    expect(lines[0]).toMatch(/^relations relations: 22 relations, /);
    expect(lines.slice(1).every((l) => /^(OK|BAD|SKIP) r\d\d [a-z_]+: /.test(l))).toBe(true);
  });

  it("exits 0 for a scene whose hard relations hold, and 2 for an invalid scene", () => {
    const yard = exec(["relations", fixturePath("yard")]);
    expect(yard.code).toBe(0);
    expect(yard.out.split("\n")[0]).toBe("relations yard: 2 relations, 1 satisfied, 1 violated, 0 skipped; hard: 1 of 1 satisfied; soft penalty 0.7172");
    expect(exec(["relations", "bad.json"], { "bad.json": '{"schema":"x"}' }).code).toBe(2);
  });
});

describe("cli: solve", () => {
  it("prints the report, writes nothing without -o or --patch, and exits by status and checks", () => {
    const r = exec(["solve", "s.json"], { "s.json": solverText("feasible") });
    expect(r.code).toBe(0);
    expect(r.out.split("\n")[0]).toBe("solve feasible: solved");
    expect([...r.files.keys()]).toEqual(["s.json"]);
    expect(r.files.get("s.json")).toBe(solverText("feasible"));
  });

  it("writes the proposal in the saved format and the patch, and never the input file", () => {
    const r = exec(["solve", "s.json", "-o", "p.json", "--patch", "m.patch", "--json"], { "s.json": solverText("feasible") });
    expect(r.code).toBe(0);
    const report = JSON.parse(r.out);
    const proposal = r.files.get("p.json") as string;
    expect(proposal).toBe(serializeScene(JSON.parse(proposal)));
    expect(r.files.get("s.json")).toBe(solverText("feasible"));
    expect((r.files.get("m.patch") as string).split("\n")[0]).toBe("# solve proposal");
    // The patch applies the proposal with lock checks.
    const applied = exec(["patch", "s.json", "m.patch", "-o", "q.json", "--json"], { "s.json": solverText("feasible"), "m.patch": r.files.get("m.patch") as string });
    expect(JSON.parse(applied.out).status).toBe("applied");
    expect(JSON.parse(applied.files.get("q.json") as string).objects).toEqual(JSON.parse(proposal).objects);
    expect(report.moved.length).toBeGreaterThan(0);
  });

  it("applies --only and reports a conflict with exit 1", () => {
    const only = exec(["solve", "s.json", "--only", "d,e", "--json"], { "s.json": solverText("only") });
    const expected = loadSolverExpected("only");
    expect(JSON.parse(only.out).moved.every((m: { id: string }) => expected.only?.includes(m.id))).toBe(true);
    const conflict = exec(["solve", "s.json", "--json"], { "s.json": solverText("conflict") });
    expect(conflict.code).toBe(1);
    expect(JSON.parse(conflict.out)).toMatchObject({ status: "conflict", conflict: ["k1", "k2", "k4"] });
    expect(exec(["solve", "s.json"], { "s.json": solverText("conflict") }).out).toContain("conflict: k1, k2, k4");
  });

  it("exits 2 for an output that is the input file, equal outputs, an unknown --only id and an invalid scene", () => {
    const files = { "s.json": solverText("feasible") };
    for (const argv of [["solve", "s.json", "-o", "s.json"], ["solve", "s.json", "--patch", "./s.json"], ["solve", "s.json", "-o", "x", "--patch", "x"], ["solve", "s.json", "--only", "ghost"]]) {
      const r = exec(argv, files);
      expect(r.code, argv.join(" ")).toBe(2);
      expect(r.err, argv.join(" ")).toMatch(/^error E_USAGE: /);
      expect(r.files.get("s.json")).toBe(files["s.json"]);
    }
    expect(exec(["solve", "bad.json"], { "bad.json": "{ nope" }).code).toBe(2);
  });

  it("exits 1 when solved but a check of the proposal fails", () => {
    const r = exec(["solve", fixturePath("yard")]);
    expect(r.code).toBe(1);
    expect(r.out.split("\n")[0]).toBe("solve yard: solved");
  });
});
