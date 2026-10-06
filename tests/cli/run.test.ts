import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { IsoblockError } from "../../src/core/errors";
import type { CheckResult } from "../../src/core/types";
import { expectMatchesExpected, fixtureNames, fixturePath, loadExpected, readFixtureText } from "../helpers/fixtures";
import { memoryIo } from "../helpers/cli";
import { makeScene } from "../helpers/scene";

const yard = fixturePath("yard");

function exec(argv: string[], files: Record<string, string> = {}) {
  const cap = memoryIo(files);
  const code = run(argv, cap.io);
  return { code, out: cap.out(), err: cap.err(), files: cap.files };
}

describe("cli: validate", () => {
  it("exits 0 for a valid scene", () => {
    const r = exec(["validate", yard]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("yard");
    expect(r.err).toBe("");
  });

  it("exits 2 with E_SCHEMA for a broken file", () => {
    const r = exec(["validate", "bad.json"], { "bad.json": '{"schema":"x"}' });
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^error E_SCHEMA: /);
    expect(r.err).toMatch(/camera/);
  });

  it("exits 2 with E_JSON_PARSE for malformed JSON", () => {
    const r = exec(["validate", "bad.json"], { "bad.json": "{ nope" });
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^error E_JSON_PARSE: /);
  });

  it("exits 2 with E_REF for a dangling reference", () => {
    const scene = JSON.parse(readFixtureText("yard"));
    scene.objects[0].type = "ghost";
    const r = exec(["validate", "bad.json"], { "bad.json": JSON.stringify(scene) });
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^error E_REF: /);
    expect(r.err).toContain('unknown type "ghost"');
  });

  it("exits 2 with E_IO for a missing file", () => {
    const r = exec(["validate", "missing.json"]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^error E_IO: /);
  });
});

describe("cli: check", () => {
  it("prints a summary line, then one line per check, and exits 1 when a check fails", () => {
    const r = exec(["check", yard]);
    expect(r.code).toBe(1);
    const lines = r.out.trimEnd().split("\n");
    expect(lines[0]).toBe("scene yard: 9 checks, 6 pass, 3 fail, 0 warn, 0 skip");
    expect(lines).toHaveLength(10);
  });

  it("exits 1 for skipped checks, even when nothing fails", () => {
    const scene = makeScene({ checks: [{ id: "c1", check: "reachable" }] });
    const r = exec(["check", "s.json"], { "s.json": JSON.stringify(scene) });
    expect(r.code).toBe(1);
    expect(r.out).toContain("SKIP c1 reachable");
  });

  it("exits 0 when every check passes", () => {
    const scene = makeScene({ objects: [{ id: "a", type: "box", pos: [0, 5] }], checks: [{ id: "c1", check: "no_overlap" }] });
    const r = exec(["check", "s.json"], { "s.json": JSON.stringify(scene) });
    expect(r.code).toBe(0);
  });

  for (const name of fixtureNames()) {
    it(`--json output for ${name} matches ${name}.expected.json`, () => {
      const r = exec(["check", "--json", fixturePath(name)]);
      const parsed = JSON.parse(r.out) as { scene: string; results: CheckResult[] };
      expect(Object.keys(parsed)).toEqual(["scene", "results"]);
      expect(parsed.scene).toBe(name);
      expectMatchesExpected(parsed.results, loadExpected(name));
      const wantsOne = loadExpected(name).results.some((x) => x.status === "fail" || x.status === "skip");
      expect(r.code).toBe(wantsOne ? 1 : 0);
    });
  }

  it("exits 2 and prints no results when the scene is invalid", () => {
    const r = exec(["check", "bad.json"], { "bad.json": "[]" });
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
  });
});

describe("cli: describe", () => {
  it("prints the summary and exits 0 even though checks fail", () => {
    const r = exec(["describe", yard]);
    expect(r.code).toBe(0);
    expect(r.out.endsWith("\n")).toBe(true);
    expect(r.out.split("\n")[0]).toMatch(/^scene yard v1 draft /);
    expect(r.out).toContain("FAIL c8 visible actor: 40% occluded (tree)");
  });
});

describe("cli: render", () => {
  it("writes an SVG and exits 0 even though checks fail", () => {
    const r = exec(["render", yard, "-o", "out.svg"]);
    expect(r.code).toBe(0);
    expect(r.files.get("out.svg")).toMatch(/^<svg /);
    expect(r.out).toContain("out.svg");
  });

  it("exits 2 for PNG output, for --state, and for a missing -o", () => {
    expect(exec(["render", yard, "-o", "out.png"]).code).toBe(2);
    expect(exec(["render", yard, "--state", "closed", "-o", "o.svg"]).code).toBe(2);
    expect(exec(["render", yard]).code).toBe(2);
  });
});

describe("cli: usage and errors", () => {
  it("prints help and exits 0", () => {
    const r = exec(["--help"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("isoblock validate");
  });

  it("exits 2 with E_USAGE for unavailable commands", () => {
    for (const argv of [["export", yard, "--target", "godot"], ["solve", yard, "--state", "night"]]) {
      const r = exec(argv);
      expect(r.code, argv.join(" ")).toBe(2);
      expect(r.err).toMatch(/^error E_USAGE: /);
    }
  });

  it("exits 2 when no command is given", () => {
    expect(exec([]).code).toBe(2);
  });

  it("exits 70 with E_INTERNAL for an unexpected failure", () => {
    const cap = memoryIo();
    const io = { ...cap.io, readText: () => { throw new TypeError("boom"); } };
    expect(run(["validate", "x.json"], io)).toBe(70);
    expect(cap.err()).toMatch(/^error E_INTERNAL: boom/);
  });

  it("keeps the code of errors thrown by the I/O layer", () => {
    const cap = memoryIo();
    const io = { ...cap.io, writeText: () => { throw new IsoblockError("E_IO", "disk full"); } };
    expect(run(["render", yard, "-o", "o.svg"], io)).toBe(2);
  });
});
