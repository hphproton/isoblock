import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../helpers/fixtures";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const core = files(join(repoRoot, "src", "core"));
const editor = files(join(repoRoot, "src", "editor"));
const sources = [
  ...core,
  ...files(join(repoRoot, "src", "cli")),
  ...editor,
  ...files(join(repoRoot, "tests")),
  ...files(join(repoRoot, "scripts")),
].filter((f) => /\.(ts|mjs|html|css)$/.test(f));

describe("repository rules", () => {
  it("keeps src/core free of Node built-ins, process and DOM globals", () => {
    const specifier = /(?:from|import\(|require\() *['"]([^'"]+)['"]/g;
    for (const file of core) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(specifier)) {
        const name = m[1] as string;
        const ok = name.startsWith("./") || name.startsWith("../") || name === "ajv";
        expect(ok, `${relative(repoRoot, file)} imports ${name}`).toBe(true);
      }
      expect(/\b(process|document|window)\b/.test(text), `${relative(repoRoot, file)} uses a banned word`).toBe(false);
    }
  });

  it("keeps src/core independent of the editor and the command line", () => {
    for (const file of core) {
      const text = readFileSync(file, "utf8");
      expect(/from ['"](\.\.\/)+(editor|cli)\b/.test(text), relative(repoRoot, file)).toBe(false);
    }
  });

  it("limits every file in src/core/checks to 150 lines", () => {
    const checks = core.filter((f) => f.includes(`${join("src", "core", "checks")}`));
    expect(checks.length).toBeGreaterThan(6);
    for (const file of checks) {
      const lines = readFileSync(file, "utf8").split("\n").length;
      expect(lines, relative(repoRoot, file)).toBeLessThanOrEqual(150);
    }
  });

  it("has one test file per check", () => {
    const names = ["inRegion", "noOverlap", "clearance", "laneClear", "laneReaches", "visible"];
    const tests = new Set(readdirSync(join(repoRoot, "tests", "checks")));
    for (const name of names) expect(tests.has(`${name}.test.ts`), name).toBe(true);
  });

  it("writes source and tests in plain ASCII", () => {
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      expect(/[^\x00-\x7f]/.test(text), relative(repoRoot, file)).toBe(false);
    }
  });
});
