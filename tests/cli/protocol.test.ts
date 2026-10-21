import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { VERSION } from "../../src/cli/version";
import { runChecks } from "../../src/core/checks";
import { describeScene } from "../../src/core/describe";
import { expectMatchesExpected, fixtureNames, fixturePath, loadExpected, loadScene, repoRoot } from "../helpers/fixtures";
import { memoryIo } from "../helpers/cli";

const yard = fixturePath("yard");

function exec(argv: string[], files: Record<string, string> = {}, stdin = "") {
  const cap = memoryIo(files, undefined, stdin);
  const code = run(argv, cap.io);
  return { code, out: cap.out(), err: cap.err(), files: cap.files };
}

describe("cli: version and validate --json", () => {
  it("prints the version from package.json and exits 0", () => {
    const r = exec(["--version"]);
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
    expect(r.out).toBe(`isoblock ${VERSION}\n`);
    expect(VERSION).toBe(JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version);
  });

  it("prints ok JSON for a valid scene and keeps the text report without --json", () => {
    const json = exec(["validate", "--json", yard]);
    expect(json.code).toBe(0);
    expect(json.err).toBe("");
    expect(JSON.parse(json.out)).toEqual({ ok: true, scene: "yard", error: null });
    const text = exec(["validate", yard]);
    expect(text.code).toBe(0);
    expect(text.out).toContain("valid isoblock/1 scene");
    expect(text.err).toBe("");
  });

  it("reports an unreadable file as JSON on stdout", () => {
    const r = exec(["validate", "--json", "missing.json"]);
    expect(r.code).toBe(2);
    expect(r.err).toBe("");
    const body = JSON.parse(r.out) as { ok: boolean; scene: string | null; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.scene).toBeNull();
    expect(body.error.code).toBe("E_IO");
  });
});

describe("cli: invalid fixtures", () => {
  const dir = join(repoRoot, "tests", "fixtures", "invalid");
  const cases = JSON.parse(readFileSync(join(dir, "cases.json"), "utf8")).cases as {
    file: string;
    code: string;
    scene: string | null;
    contains: string[];
    excludes: string[];
  }[];

  it("finds the 15 fixtures", () => {
    expect(cases).toHaveLength(15);
  });

  for (const c of cases) {
    it(`${c.file} matches its code, scene and detail rules`, () => {
      const source = readFileSync(join(dir, c.file), "utf8");
      const r = exec(["validate", "--json", c.file], { [c.file]: source });
      expect(r.code, c.file).toBe(2);
      expect(r.err, c.file).toBe("");
      const body = JSON.parse(r.out) as { ok: boolean; scene: string | null; error: { code: string; message: string; details: string[] } };
      expect(body.ok).toBe(false);
      expect(body.scene).toBe(c.scene);
      expect(body.error.code).toBe(c.code);
      const text = [body.error.message, ...body.error.details].join("\n");
      for (const part of c.contains) expect(text, part).toContain(part);
      for (const part of c.excludes) expect(text, part).not.toContain(part);
    });
  }
});

describe("cli: check --only and describe flags", () => {
  it("runs the named checks in checks order and exits from that selection", () => {
    const selected = exec(["check", "--json", "--only", "c8,c4", yard]);
    expect(selected.code).toBe(1);
    const body = JSON.parse(selected.out) as { results: { id: string }[] };
    expect(body.results.map((r) => r.id)).toEqual(["c4", "c8"]);
    const passing = exec(["check", yard, "--only", "c1"]);
    expect(passing.code).toBe(0);
    expect(passing.out.startsWith("scene yard: 1 checks, ")).toBe(true);
  });

  it("rejects an unknown check id", () => {
    const r = exec(["check", yard, "--only", "c1,nope"]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^error E_USAGE: unknown check "nope"/);
    expect(r.out).toBe("");
  });

  it("describe --relations --states matches the core", () => {
    const scene = loadScene("yard");
    const text = describeScene(scene, runChecks(scene), { relations: true, states: true });
    const r = exec(["describe", yard, "--states", "--relations"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(`${text}\n`);
  });
});

describe("cli: check --failing", () => {
  for (const name of fixtureNames()) {
    it(`${name}: prints the fail and skip rows in order and keeps the full exit code`, () => {
      const file = fixturePath(name);
      const full = exec(["check", "--json", file]);
      const failing = exec(["check", "--json", "--failing", file]);
      expect(failing.code, name).toBe(full.code);
      expect(failing.err, name).toBe("");
      const expected = loadExpected(name);
      const rows = expected.results.filter((row) => row.status === "fail" || row.status === "skip");
      expectMatchesExpected(JSON.parse(failing.out).results, { ...expected, results: rows });
      const text = exec(["check", "--failing", file]);
      const lines = text.out.trimEnd().split("\n");
      expect(lines[0], name).toBe(exec(["check", file]).out.trimEnd().split("\n")[0]);
      expect(lines.slice(1).every((line) => /^(FAIL|SKIP) /.test(line)), name).toBe(true);
      expect(lines.length - 1, name).toBe(rows.length);
    });
  }

  it("limits the rows to the checks named by --only", () => {
    const selected = exec(["check", yard, "--only", "c4,c1", "--failing"]);
    const lines = selected.out.trimEnd().split("\n");
    expect(lines[0]).toBe("scene yard: 2 checks, 1 pass, 1 fail, 0 warn, 0 skip");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^FAIL c4 /);
    expect(selected.code).toBe(1);
  });
});

describe("cli: patch from standard input", () => {
  it("gives the same report as a file and names the patch - in the log", () => {
    const patch = "# nudge\nmove crate2 u+0.4\n";
    const fromFile = exec(["patch", yard, "nudge.patch", "-o", "out.json", "--json"], { "nudge.patch": patch });
    const fromStdin = exec(["patch", yard, "-", "-o", "stdin.json", "--json"], {}, patch);
    expect(fromStdin.code).toBe(fromFile.code);
    expect(fromStdin.err).toBe("");
    expect(JSON.parse(fromStdin.out)).toEqual(JSON.parse(fromFile.out));
    const fileLog = JSON.parse(fromFile.files.get("out.log.jsonl") ?? "") as { patch: string };
    const stdinLog = JSON.parse(fromStdin.files.get("stdin.log.jsonl") ?? "") as { patch: string };
    expect(stdinLog.patch).toBe("-");
    expect({ ...stdinLog, patch: fileLog.patch }).toEqual(fileLog);
  });
});
