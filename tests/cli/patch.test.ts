import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { serializeScene } from "../../src/core/serialize";
import { parseScene } from "../../src/core/validate";
import {
  expectMatchesCompare, expectMatchesPatch, fixturePath, loadCompareExpected, loadPatchExpected, loadScene,
  patchFixtureNames, readCompareFile, readFixtureText, readPatchText, yardVariants,
} from "../helpers/fixtures";
import { memoryIo } from "../helpers/cli";

const yard = fixturePath("yard");

function exec(argv: string[], files: Record<string, string> = {}) {
  const cap = memoryIo(files);
  const code = run(argv, cap.io);
  return { code, out: cap.out(), err: cap.err(), files: cap.files };
}

describe("cli: patch on every patch fixture", () => {
  for (const name of patchFixtureNames()) {
    it(`${name}: --json report, exit code and files`, () => {
      const expected = loadPatchExpected(name);
      const r = exec(["patch", fixturePath(expected.base), "p.patch", "-o", "out.json", "--json"], { "p.patch": readPatchText(name) });
      expect(r.code, `${name} exit`).toBe(expected.exit);
      expect(r.err).toBe("");
      const report = JSON.parse(r.out);
      expect(Object.keys(report)).toEqual(["scene", "status", "error", "locks", "diff", "checks", "failing"]);
      expectMatchesPatch(report, expected, name);
      expect(r.files.has("out.json"), `${name} writes the scene only when applied`).toBe(expected.status === "applied");
      const log = r.files.get("out.log.jsonl");
      if (expected.status === "invalid") expect(log, `${name} writes no log`).toBeUndefined();
      else expect(log?.split("\n").filter((l) => l !== ""), `${name} log`).toHaveLength(1);
    });
  }
});

describe("cli: patch output", () => {
  const patch = "# crate2 moves away\nmove crate2 u+0.4\n";

  it("writes the result in the saved format and does not change the input scene", () => {
    const r = exec(["patch", yard, "p.patch", "-o", "out.json"], { "p.patch": patch });
    expect(r.code).toBe(1);
    const written = r.files.get("out.json") as string;
    expect(written).toBe(serializeScene(parseScene(written)));
    expect(parseScene(written).objects.find((o) => o.id === "crate2")?.pos).toEqual([7.2, 0.5]);
    expect(r.out.split("\n")[0]).toBe("patch yard: applied");
    expect(r.out).toContain("wrote out.json");
  });

  it("leaves the input file alone when -o names another file", () => {
    const text = serializeScene(loadScene("yard"));
    const r = exec(["patch", "s.json", "p.patch", "-o", "out.json"], { "s.json": text, "p.patch": patch });
    expect(r.files.get("s.json")).toBe(text);
    expect(r.files.has("out.json")).toBe(true);
  });

  it("writes back to the input file without -o, and the log goes next to it", () => {
    const text = serializeScene(loadScene("yard"));
    const r = exec(["patch", "s.scene.json", "p.patch"], { "s.scene.json": text, "p.patch": patch });
    expect(parseScene(r.files.get("s.scene.json") as string).objects[3]?.pos).toEqual([7.2, 0.5]);
    expect(r.files.has("s.scene.log.jsonl")).toBe(true);
  });

  it("an empty patch leaves a file in the saved format byte for byte the same", () => {
    const text = serializeScene(loadScene("yard"));
    const r = exec(["patch", "s.json", "p.patch"], { "s.json": text, "p.patch": "# nothing\n" });
    expect(r.files.get("s.json")).toBe(text);
    expect(r.code).toBe(1);
  });

  it("applying twice in a row, with the result of the first as the input of the second, adds up", () => {
    const first = exec(["patch", yard, "p.patch", "-o", "one.json"], { "p.patch": "move crate2 u+0.4" });
    const second = exec(["patch", "one.json", "p.patch", "-o", "two.json"], { "p.patch": "move crate2 u+0.4", "one.json": first.files.get("one.json") as string });
    expect(parseScene(second.files.get("two.json") as string).objects[3]?.pos).toEqual([7.6, 0.5]);
  });

  it("exits 0 when no check fails or is skipped after the patch", () => {
    const scene = JSON.stringify({ ...loadScene("yard"), checks: [{ id: "c3", check: "no_overlap" }] });
    const r = exec(["patch", "s.json", "p.patch", "--dry-run"], { "s.json": scene, "p.patch": "move crate2 u+0.4" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("failing checks: 0");
  });

  it("prints a text report for an applied patch", () => {
    const lines = exec(["patch", yard, "p.patch", "--dry-run"], { "p.patch": patch }).out.split("\n");
    expect(lines[0]).toBe("patch yard: applied");
    expect(lines).toContain("~ /objects/crate2/pos [6.8,0.5] -> [7.2,0.5]");
    expect(lines).toContain("check c4 clearance: fail -> pass (0.2 -> 0.6)");
    expect(lines).toContain("failing checks: 2");
    expect(lines).toContain("dry run: nothing written");
  });

  it("prints the error and exits 3 for a lock and 2 for an invalid patch", () => {
    const locked = exec(["patch", yard, "p.patch", "-o", "o.json"], { "p.patch": "move tree u+1" });
    expect(locked.code).toBe(3);
    expect(locked.out).toBe("patch yard: rejected\nerror E_LOCK: the patch touches locks: tree.pos\n");
    const bad = exec(["patch", yard, "p.patch", "-o", "o.json"], { "p.patch": "move ghost u+1" });
    expect(bad.code).toBe(2);
    expect(bad.out).toBe('patch yard: invalid\nerror E_PATCH: line 1: unknown object "ghost"\n');
    expect(bad.err).toBe("");
  });
});

describe("cli: patch writes nothing when it must not", () => {
  it("a rejected patch leaves the scene file as it was and adds one line to the log", () => {
    const text = serializeScene(loadScene("yard"));
    const r = exec(["patch", "s.json", "p.patch"], { "s.json": text, "p.patch": "move tree u+1" });
    expect(r.files.get("s.json")).toBe(text);
    expect(r.files.get("s.log.jsonl")?.split("\n").filter((l) => l !== "")).toHaveLength(1);
  });

  it("an invalid patch leaves the scene file as it was and writes no log", () => {
    const text = serializeScene(loadScene("yard"));
    const r = exec(["patch", "s.json", "p.patch"], { "s.json": text, "p.patch": "set /objects/0/type nothing" });
    expect(r.code).toBe(2);
    expect(r.files.get("s.json")).toBe(text);
    expect(r.files.has("s.log.jsonl")).toBe(false);
  });

  it("--dry-run writes neither the scene nor the log, for any outcome", () => {
    for (const patch of ["move crate2 u+0.4", "move tree u+1", "move ghost u+1"]) {
      const r = exec(["patch", yard, "p.patch", "-o", "o.json", "--dry-run"], { "p.patch": patch });
      expect([...r.files.keys()].sort(), patch).toEqual(["p.patch"]);
    }
  });
});

describe("cli: the patch log", () => {
  const path = "dir/p1.patch";

  it("is named after the output file without .json, and counts seq from 1", () => {
    const files: Record<string, string> = { [path]: "# first\nmove crate2 u+0.4", "dir/p2.patch": "move tree u+1" };
    const cap = memoryIo(files);
    expect(run(["patch", yard, path, "-o", "out.json"], cap.io)).toBe(1);
    expect(run(["patch", yard, "dir/p2.patch", "-o", "out.json"], cap.io)).toBe(3);
    expect(run(["patch", yard, path, "-o", "out.json"], cap.io)).toBe(1);
    const lines = (cap.files.get("out.log.jsonl") as string).split("\n");
    expect(lines.at(-1)).toBe("");
    const entries = lines.slice(0, -1).map((l) => JSON.parse(l));
    expect(entries.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(entries.map((e) => e.patch)).toEqual(["p1.patch", "p2.patch", "p1.patch"]);
    expect(entries.map((e) => e.status)).toEqual(["applied", "rejected", "applied"]);
    expect(entries.map((e) => e.description)).toEqual(["first", null, "first"]);
    expect(entries[1].error).toMatchObject({ code: "E_LOCK" });
    expect(entries[1].locks).toEqual(["tree.pos"]);
    expect(Object.keys(entries[0])).toEqual(["seq", "patch", "description", "status", "error", "locks", "diff", "checks"]);
    expect(JSON.stringify(entries)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("continues a log that does not end with a newline", () => {
    const cap = memoryIo({ "p.patch": "move crate2 u+0.4", "out.log.jsonl": '{"seq":1}' });
    run(["patch", yard, "p.patch", "-o", "out.json"], cap.io);
    const lines = (cap.files.get("out.log.jsonl") as string).split("\n").filter((l) => l !== "");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1] as string).seq).toBe(2);
  });

  it("names the log of an output that does not end in .json by appending", () => {
    const cap = memoryIo({ "p.patch": "move crate2 u+0.4" });
    run(["patch", yard, "p.patch", "-o", "out.txt"], cap.io);
    expect(cap.files.has("out.txt.log.jsonl")).toBe(true);
  });
});

describe("cli: patch input errors", () => {
  it("exits 2 with the error on stderr for an invalid scene, malformed JSON and a missing patch file", () => {
    const bad = exec(["patch", "s.json", "p.patch", "--json"], { "s.json": '{"schema":"x"}', "p.patch": "" });
    expect([bad.code, bad.out, bad.err.split(":")[0]]).toEqual([2, "", "error E_SCHEMA"]);
    expect(exec(["patch", "s.json", "p.patch"], { "s.json": "{ nope", "p.patch": "" }).err).toMatch(/^error E_JSON_PARSE/);
    const missing = exec(["patch", yard, "gone.patch"]);
    expect([missing.code, missing.err.split(":")[0]]).toEqual([2, "error E_IO"]);
  });

  it("exits 2 with E_USAGE for solve in a patch, as an invalid patch", () => {
    const r = exec(["patch", yard, "p.patch", "--json", "--dry-run"], { "p.patch": "solve" });
    expect(r.code).toBe(2);
    expect(JSON.parse(r.out)).toMatchObject({ status: "invalid", error: { code: "E_USAGE" } });
  });
});

describe("cli: diff", () => {
  const a = serializeScene(loadScene("yard"));
  const b = a.replace('"pos": [\n        6.8,', '"pos": [\n        7.2,');

  it("prints the changes as text and exits 0", () => {
    const r = exec(["diff", "a.json", "b.json"], { "a.json": a, "b.json": b });
    expect(b).not.toBe(a);
    expect(r.code).toBe(0);
    expect(r.out).toBe("diff yard -> yard: 1 changes\n~ /objects/crate2/pos [6.8,0.5] -> [7.2,0.5]\n");
  });

  it("prints a, b and changes with --json", () => {
    const r = exec(["diff", "a.json", "b.json", "--json"], { "a.json": a, "b.json": b });
    expect(JSON.parse(r.out)).toEqual({ a: "yard", b: "yard", changes: [{ op: "replace", path: "/objects/crate2/pos", from: [6.8, 0.5], to: [7.2, 0.5] }] });
  });

  it("says 0 changes for the same file, also when one is written in another format", () => {
    const compact = JSON.stringify(loadScene("yard"));
    expect(exec(["diff", "a.json", "b.json"], { "a.json": a, "b.json": compact }).out).toBe("diff yard -> yard: 0 changes\n");
  });

  it("exits 2 when either file is invalid", () => {
    expect(exec(["diff", "a.json", "b.json"], { "a.json": a, "b.json": "{}" }).code).toBe(2);
    expect(exec(["diff", "a.json", "gone.json"], { "a.json": a }).err).toMatch(/^error E_IO/);
  });
});

describe("cli: compare", () => {
  function files(): Record<string, string> {
    return Object.fromEntries(yardVariants().map((v) => [`${v.name}.patch`, v.text]));
  }
  const argv = (...extra: string[]) => ["compare", yard, "--variant", "A=A.patch", "--variant", "B=B.patch", "--variant", "C=C.patch", ...extra];

  it("prints yard.expected.txt byte for byte by default and with --format text", () => {
    for (const extra of [[], ["--format", "text"]]) {
      const r = exec(argv(...extra), files());
      expect(r.code).toBe(0);
      expect(r.out).toBe(readCompareFile("yard.expected.txt"));
    }
  });

  it("prints yard.expected.md byte for byte with --format md", () => {
    expect(exec(argv("--format", "md"), files()).out).toBe(readCompareFile("yard.expected.md"));
  });

  it("prints yard.expected.json within tolerance with --format json, and exits 0 though checks fail", () => {
    const r = exec(argv("--format", "json"), files());
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.out);
    expect(Object.keys(parsed)).toEqual(["scene", "state", "variants", "failing", "locksTouched", "moved", "checks"]);
    expectMatchesCompare(parsed, loadCompareExpected());
  });

  it("takes a scene file as a variant", () => {
    const other = JSON.parse(readFixtureText("yard"));
    other.objects[3].pos = [7.2, 0.5];
    const r = exec(["compare", yard, "--variant", "S=s.json"], { "s.json": JSON.stringify(other) });
    expect(r.out.split("\n")[1]).toBe("S = S");
    expect(r.out).toContain("1 / 0.40");
  });

  it("exits 2 with the error on stderr when a variant is malformed or invalid", () => {
    const r = exec(["compare", yard, "--variant", "X=x.patch"], { "x.patch": "move ghost u+1" });
    expect([r.code, r.out]).toEqual([2, ""]);
    expect(r.err).toMatch(/^error E_PATCH: variant X: line 1: unknown object "ghost"/);
    expect(exec(["compare", yard, "--variant", "X=gone.patch"]).err).toMatch(/^error E_IO/);
  });
});
