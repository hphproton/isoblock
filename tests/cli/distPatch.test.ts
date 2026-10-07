import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serializeScene } from "../../src/core/serialize";
import { parseScene } from "../../src/core/validate";
import {
  compareDir, expectMatchesCompare, expectMatchesPatch, fixturePath, loadCompareExpected, loadPatchExpected, patchFixtureNames,
  patchFixturePath, readCompareFile, repoRoot,
} from "../helpers/fixtures";

const dist = join(repoRoot, "dist", "isoblock.mjs");
let work = "";

function node(...args: string[]) {
  return spawnSync(process.execPath, [dist, ...args], { encoding: "utf8" });
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "isoblock-dist-patch-"));
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe("dist/isoblock.mjs: patch", () => {
  for (const name of patchFixtureNames()) {
    it(`${name} on a copy of its base scene`, () => {
      const expected = loadPatchExpected(name);
      const scene = join(work, `${name}.scene.json`);
      copyFileSync(fixturePath(expected.base), scene);
      const before = readFileSync(scene, "utf8");
      const r = node("patch", scene, patchFixturePath(name), "--json");
      expect(r.status, `${name} exit`).toBe(expected.exit);
      expectMatchesPatch(JSON.parse(r.stdout), expected, name);
      const log = join(work, `${name}.scene.log.jsonl`);
      if (expected.status === "applied") {
        expect(readFileSync(scene, "utf8")).not.toBe(before);
        expect(parseScene(readFileSync(scene, "utf8")).id).toBe(expected.base);
      } else {
        expect(readFileSync(scene, "utf8"), `${name} leaves the scene unchanged`).toBe(before);
      }
      expect(existsSync(log), `${name} log`).toBe(expected.status !== "invalid");
    });
  }

  it("writes the result in the saved format to -o and logs next to it", () => {
    const out = join(work, "result.json");
    const r = node("patch", fixturePath("yard"), patchFixturePath("01-move-one-axis"), "-o", out);
    expect(r.status).toBe(1);
    expect(r.stdout.split("\n")[0]).toBe("patch yard: applied");
    const text = readFileSync(out, "utf8");
    expect(text).toBe(serializeScene(parseScene(text)));
    const line = JSON.parse(readFileSync(join(work, "result.log.jsonl"), "utf8").trim());
    expect([line.seq, line.patch, line.status]).toEqual([1, "01-move-one-axis.patch", "applied"]);
  });

  it("--dry-run writes nothing", () => {
    const out = join(work, "dry.json");
    const r = node("patch", fixturePath("yard"), patchFixturePath("01-move-one-axis"), "-o", out, "--dry-run");
    expect(r.status).toBe(1);
    expect(existsSync(out)).toBe(false);
    expect(existsSync(join(work, "dry.log.jsonl"))).toBe(false);
  });

  it("exits 2 for solve and 3 for a lock", () => {
    expect(node("patch", fixturePath("yard"), patchFixturePath("17-later-command"), "--dry-run").status).toBe(2);
    expect(node("patch", fixturePath("yard"), patchFixturePath("03-move-locked"), "--dry-run").status).toBe(3);
  });
});

describe("dist/isoblock.mjs: diff and compare", () => {
  const variants = ["A", "B", "C"].flatMap((n) => ["--variant", `${n}=${join(compareDir, `yard.${n}.patch`)}`]);

  it("compare gives the three formats of the fixture", () => {
    const text = node("compare", fixturePath("yard"), ...variants);
    expect([text.status, text.stdout]).toEqual([0, readCompareFile("yard.expected.txt")]);
    expect(node("compare", fixturePath("yard"), ...variants, "--format", "md").stdout).toBe(readCompareFile("yard.expected.md"));
    const json = node("compare", fixturePath("yard"), ...variants, "--format", "json");
    expect(json.status).toBe(0);
    expectMatchesCompare(JSON.parse(json.stdout), loadCompareExpected());
  });

  it("compare exits 2 without a variant, with an unknown state and with --render", () => {
    expect(node("compare", fixturePath("yard")).status).toBe(2);
    expect(node("compare", fixturePath("yard"), ...variants, "--state", "night").stderr).toMatch(/unknown state/);
    expect(node("compare", fixturePath("yard"), ...variants, "--render").stderr).toMatch(/not scheduled/);
  });

  it("diff lists the change between a scene and its patched copy", () => {
    const out = join(work, "diff.json");
    node("patch", fixturePath("yard"), patchFixturePath("02-move-two-axes"), "-o", out);
    const r = node("diff", fixturePath("yard"), out);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("diff yard -> yard: 1 changes\n~ /objects/bench/pos [3.4,2.6] -> [3.2,2.9]\n");
    expect(JSON.parse(node("diff", fixturePath("yard"), out, "--json").stdout).changes).toHaveLength(1);
  });

  it("diff exits 2 for a file that is not a scene", () => {
    const bad = join(work, "bad.json");
    writeFileSync(bad, "{}");
    expect(node("diff", fixturePath("yard"), bad).status).toBe(2);
  });
});
