import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeScene } from "../../src/core/describe";
import { runChecks } from "../../src/core/checks";
import { expectMatchesExpected, fixtureNames, fixturePath, loadExpected, loadScene, repoRoot } from "../helpers/fixtures";

const dist = join(repoRoot, "dist", "isoblock.mjs");
let work = "";

function node(...args: string[]) {
  return spawnSync(process.execPath, [dist, ...args], { encoding: "utf8" });
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "isoblock-dist-"));
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe("dist/isoblock.mjs", () => {
  it("is built and starts with a node shebang", () => {
    expect(existsSync(dist)).toBe(true);
    expect(readFileSync(dist, "utf8").startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  for (const name of fixtureNames()) {
    it(`check --json matches ${name}.expected.json and exits accordingly`, () => {
      const r = node("check", "--json", fixturePath(name));
      expectMatchesExpected(JSON.parse(r.stdout).results, loadExpected(name));
      const wantsOne = loadExpected(name).results.some((x) => x.status === "fail" || x.status === "skip");
      expect(r.status).toBe(wantsOne ? 1 : 0);
    });
  }

  it("describe prints the same text as the core", () => {
    const scene = loadScene("yard");
    const r = node("describe", fixturePath("yard"));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`${describeScene(scene, runChecks(scene))}\n`);
  });

  it("render writes an SVG file", () => {
    const out = join(work, "yard.svg");
    const r = node("render", fixturePath("yard"), "-o", out);
    expect(r.status).toBe(0);
    expect(readFileSync(out, "utf8")).toMatch(/^<svg /);
  });

  it("validate exits 2 for a broken file and for a missing file", () => {
    const bad = join(work, "bad.json");
    writeFileSync(bad, '{"schema":"x"}');
    const r = node("validate", bad);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/^error E_SCHEMA: /);
    expect(node("validate", join(work, "missing.json")).status).toBe(2);
  });

  it("exits 2 for unavailable commands and flags", () => {
    expect(node("export", fixturePath("yard"), "--target", "godot").status).toBe(2);
    expect(node("check", "--state", "night", fixturePath("yard")).status).toBe(2); // yard has no state "night"
  });
});
