import { describe, expect, it } from "vitest";
import { runPatch } from "../../src/core/patch/outcome";
import { formatPatchReport, patchExitCode, patchLogLine, patchReportJson } from "../../src/core/patch/report";
import type { Scene } from "../../src/core/types";
import { makeScene } from "../helpers/scene";

const base = (): Scene =>
  makeScene({
    types: { box: { size: [1, 1, 1] }, plank: { size: [2, 1, 1] } },
    objects: [
      { id: "a", type: "box", pos: [0, 5], locks: ["pos"] },
      { id: "b", type: "box", pos: [1.5, 5] },
      { id: "c", type: "plank", pos: [6, 5], rot: 0, locks: ["rot", "pos.u"] },
    ],
    checks: [
      { id: "k1", check: "clearance", a: "a", b: "b", min: 1 },
      { id: "k2", check: "no_overlap" },
      { id: "k3", check: "reachable" },
    ],
  });

describe("runPatch: the order of outcomes", () => {
  it("a failing command is invalid (E_PATCH) before locks are looked at", () => {
    const o = runPatch(base(), "move a u+1\nmove ghost u+1");
    expect([o.status, o.error?.code, o.locks]).toEqual(["invalid", "E_PATCH", []]);
  });

  it("a command of a later stage is invalid with E_USAGE", () => {
    const o = runPatch(base(), "solve");
    expect([o.status, o.error?.code]).toEqual(["invalid", "E_USAGE"]);
    expect(patchExitCode(o)).toBe(2);
  });

  it("a touched lock is rejected (E_LOCK, exit 3) before the result is validated", () => {
    const o = runPatch(base(), "move a u+1\nset /objects/1/type nothing");
    expect([o.status, o.error?.code, o.locks]).toEqual(["rejected", "E_LOCK", ["a.pos"]]);
    expect(patchExitCode(o)).toBe(3);
    expect(o.result).toBeNull();
  });

  it("a result that fails the schema is invalid (E_SCHEMA)", () => {
    const o = runPatch(base(), "set /objects/1/pos [1]".replace("[1]", '"[1]"'));
    expect([o.status, o.error?.code, o.locks]).toEqual(["invalid", "E_SCHEMA", []]);
    expect(patchExitCode(o)).toBe(2);
  });

  it("a result with a broken reference is invalid (E_REF)", () => {
    const o = runPatch(base(), "set /objects/1/type nothing");
    expect([o.status, o.error?.code]).toEqual(["invalid", "E_REF"]);
    expect(o.error?.message).toContain('unknown type "nothing"');
    expect(runPatch(base(), "relate b left_of ghost").error?.code).toBe("E_REF");
    expect(runPatch(base(), "relate b nowhere_of a").error?.code).toBe("E_SCHEMA");
  });

  it("an invalid or rejected patch reports no diff, no checks and failing null", () => {
    for (const text of ["move ghost u+1", "move a u+1", "set /objects/1/type nothing"]) {
      const o = runPatch(base(), text);
      expect([o.diff, o.checks, o.failing, o.result]).toEqual([[], [], null, null]);
    }
  });
});

describe("runPatch: an applied patch", () => {
  it("reports the diff, the changed checks and the number of failing checks", () => {
    const o = runPatch(base(), "# make room\nmove b u+1");
    expect(o.status).toBe("applied");
    expect(o.error).toBeNull();
    expect(o.description).toBe("make room");
    expect(o.diff).toEqual([{ op: "replace", path: "/objects/b/pos", from: [1.5, 5], to: [2.5, 5] }]);
    expect(o.checks).toEqual([{ id: "k1", check: "clearance", from: "fail", to: "pass", value: [0.5, 1.5] }]);
    expect(o.failing).toBe(1);
    expect(patchExitCode(o)).toBe(1);
  });

  it("counts a skipped check as failing, and exits 0 when none fails or is skipped", () => {
    const clean = runPatch(base(), "set /checks/2/check no_overlap".replace("no_overlap", '"no_overlap"') + "\nmove b u+1");
    expect([clean.status, clean.failing]).toEqual(["applied", 0]);
    expect(patchExitCode(clean)).toBe(0);
  });

  it("lists a check only when its status changed or its value changed by more than 1e-9", () => {
    expect(runPatch(base(), "move c v+1").checks).toEqual([]);
    expect(runPatch(base(), "move b u+0.0000000001").checks).toEqual([]);
    expect(runPatch(base(), "move b u+0.00001").checks).toMatchObject([{ id: "k1", from: "fail", to: "fail" }]);
  });

  it("does not list checks that the patch added or removed", () => {
    const o = runPatch(base(), JSON.stringify([{ op: "remove", path: "/checks/0" }, { op: "add", path: "/checks/-", value: { id: "k9", check: "no_overlap" } }]));
    expect(o.status).toBe("applied");
    expect(o.checks).toEqual([]);
    expect(o.diff.map((d) => d.path)).toEqual(["/checks/k1", "/checks/k9"]);
  });

  it("applies a patch that touches no lock even when it adds one", () => {
    const o = runPatch(base(), "lock b pos\nmove b u+1");
    expect([o.status, o.locks]).toEqual(["applied", []]);
  });

  it("has a null description for a JSON Patch and for a patch without comments", () => {
    expect(runPatch(base(), '[{"op":"add","path":"/objects/1/tags","value":["t"]}]').description).toBeNull();
    expect(runPatch(base(), "move b u+1").description).toBeNull();
    expect(runPatch(base(), "#\n# second\nmove b u+1").description).toBeNull();
  });

  it("returns the patched scene and leaves the original alone", () => {
    const original = base();
    const o = runPatch(original, "move b u+1");
    expect(o.result?.objects[1]?.pos).toEqual([2.5, 5]);
    expect(original.objects[1]?.pos).toEqual([1.5, 5]);
  });
});

describe("patch report", () => {
  it("has the keys of SPEC section 12, in order", () => {
    const o = runPatch(base(), "move b u+1");
    expect(Object.keys(patchReportJson(o))).toEqual(["scene", "status", "error", "locks", "diff", "checks", "failing"]);
    expect(patchReportJson(o).scene).toBe("synthetic");
  });

  it("starts the text with `patch <scene id>: <status>` and shows errors and changes", () => {
    const text = formatPatchReport(runPatch(base(), "move b u+1")).split("\n");
    expect(text[0]).toBe("patch synthetic: applied");
    expect(text).toContain("~ /objects/b/pos [1.5,5] -> [2.5,5]");
    expect(text).toContain("check k1 clearance: fail -> pass (0.5 -> 1.5)");
    expect(text.at(-1)).toBe("failing checks: 1");
    expect(formatPatchReport(runPatch(base(), "move a u+1"))).toBe("patch synthetic: rejected\nerror E_LOCK: the patch touches locks: a.pos");
    expect(formatPatchReport(runPatch(base(), "move ghost u+1")).split("\n")[0]).toBe("patch synthetic: invalid");
  });

  it("joins the details of an error into its message", () => {
    const o = runPatch(base(), "set /objects/1/type nothing");
    expect(o.error?.message).toMatch(/^scene has unresolved references \(1 problems\): object "b" uses unknown type "nothing"/);
  });

  it("writes a log line with the keys of SPEC section 12", () => {
    const line = patchLogLine(3, "p.patch", runPatch(base(), "# why\nmove b u+1"));
    expect(line).not.toContain("\n");
    const entry = JSON.parse(line);
    expect(Object.keys(entry)).toEqual(["seq", "patch", "description", "status", "error", "locks", "diff", "checks"]);
    expect([entry.seq, entry.patch, entry.description, entry.status, entry.error]).toEqual([3, "p.patch", "why", "applied", null]);
    const rejected = JSON.parse(patchLogLine(1, "p.patch", runPatch(base(), "move a u+1")));
    expect([rejected.status, rejected.error.code, rejected.locks]).toEqual(["rejected", "E_LOCK", ["a.pos"]]);
  });
});
