import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { memoryIo } from "../helpers/cli";
import { fixturePath } from "../helpers/fixtures";
import { makeScene } from "../helpers/scene";
import { walkScenePath } from "../helpers/states";

const yard = fixturePath("yard");
const walk = walkScenePath();

function exec(argv: string[], files: Record<string, string> = {}) {
  const cap = memoryIo(files);
  const code = run(argv, cap.io);
  return { code, out: cap.out(), err: cap.err(), files: cap.files };
}

/** Two crates that overlap and a third that does not; the state "apart" hides one of the overlapping pair. */
const crates = JSON.stringify(
  makeScene({
    types: { box: { size: [1, 1, 1] } },
    objects: [
      { id: "a", type: "box", pos: [0, 5], locks: ["pos"] },
      { id: "b", type: "box", pos: [0.5, 5] },
      { id: "c", type: "box", pos: [5, 5] },
    ],
    checks: [{ id: "k1", check: "no_overlap" }, { id: "k2", check: "clearance", a: "b", b: "c", min: 1 }],
    states: { apart: { hide: ["b"] } },
  }),
);

describe("cli: check --state", () => {
  it("evaluates the scene in the state: the exit code follows its results", () => {
    expect(exec(["check", "s.json"], { "s.json": crates }).code).toBe(1);
    const inState = exec(["check", "s.json", "--state", "apart"], { "s.json": crates });
    expect(inState.code).toBe(1); // k2 names b, which is hidden: skip is not a pass
    expect(inState.out).toContain("PASS k1 no_overlap");
    expect(inState.out).toContain("SKIP k2 clearance: ");
  });

  it("names the state in the summary line, and not when there is none", () => {
    expect(exec(["check", walk, "--state", "empty"]).out.split("\n")[0]).toBe("scene walk (state empty): 17 checks, 8 pass, 5 fail, 0 warn, 4 skip");
    expect(exec(["check", walk]).out.split("\n")[0]).toMatch(/^scene walk: 17 checks, /);
  });

  it("keeps the --json shape: { scene, results }", () => {
    const r = exec(["check", walk, "--state", "open", "--json"]);
    expect(Object.keys(JSON.parse(r.out))).toEqual(["scene", "results"]);
  });

  it("is a usage error (exit 2, E_USAGE) for a state the scene does not define, naming the states it has", () => {
    const r = exec(["check", walk, "--state", "night"]);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(r.err).toBe("error E_USAGE: unknown state 'night'\n  The scene defines: open, empty.\n");
    expect(exec(["check", "s.json", "--state", "night"], { "s.json": JSON.stringify(makeScene()) }).err).toContain("The scene defines no states.");
  });

  it("gives identical bytes on two runs", () => {
    expect(exec(["check", walk, "--state", "empty", "--json"]).out).toBe(exec(["check", walk, "--state", "empty", "--json"]).out);
  });
});

describe("cli: render --state", () => {
  it("does not draw the hidden objects", () => {
    const all = exec(["render", yard, "-o", "all.svg"]).files.get("all.svg") as string;
    const closed = exec(["render", yard, "--state", "closed", "-o", "closed.svg"]).files.get("closed.svg") as string;
    expect(all).toContain('data-ref="bench"');
    expect(closed).not.toContain('data-ref="bench"');
    expect(closed).toContain('data-ref="tree"');
  });

  it("is a usage error for an unknown state and then writes nothing", () => {
    const r = exec(["render", yard, "--state", "night", "-o", "o.svg"]);
    expect([r.code, r.files.has("o.svg")]).toEqual([2, false]);
    expect(r.err).toMatch(/^error E_USAGE: unknown state 'night'/);
  });
});

describe("cli: export --state", () => {
  const boxes = (argv: string[]) => (JSON.parse(exec(["export", yard, "--target", "gen-bbox", ...argv]).out) as { boxes: { id: string; box: number[] }[] }).boxes;

  it("gives no generation box to a hidden object and leaves the other boxes as they are", () => {
    const all = boxes([]);
    const closed = boxes(["--state", "closed"]);
    expect(all.map((b) => b.id)).toContain("bench");
    expect(closed.map((b) => b.id)).toEqual(all.map((b) => b.id).filter((id) => id !== "bench"));
    for (const b of closed) expect(b).toEqual(all.find((x) => x.id === b.id));
  });

  it("works with the other gen-bbox flags", () => {
    const r = exec(["export", yard, "--target", "gen-bbox", "--bbox-units", "norm1000", "--bbox-order", "yxyx", "--state", "closed"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ units: "norm1000", order: "yxyx" });
  });

  it("is a usage error for an unknown state and with the runtime target", () => {
    const unknown = exec(["export", yard, "--target", "gen-bbox", "--state", "night"]);
    expect([unknown.code, unknown.out]).toEqual([2, ""]);
    expect(unknown.err).toMatch(/^error E_USAGE: unknown state 'night'/);
    const runtime = exec(["export", yard, "--target", "runtime", "--state", "closed"]);
    expect([runtime.code, runtime.out]).toEqual([2, ""]);
    expect(runtime.err).toMatch(/^error E_USAGE: --state applies to the gen-bbox target only/);
  });
});

describe("cli: --state on other commands", () => {
  it("is a usage error for validate, describe, relations, solve, patch and diff", () => {
    for (const argv of [["validate", yard], ["describe", yard], ["relations", yard], ["solve", yard], ["patch", yard, "p.txt"], ["diff", yard, yard]]) {
      const r = exec([...argv, "--state", "closed"]);
      expect(r.code, argv[0]).toBe(2);
      expect(r.err, argv[0]).toMatch(new RegExp(`^error E_USAGE: flag '--state' does not apply to '${argv[0]}'`));
    }
  });
});

describe("cli: compare --state", () => {
  const variants = {
    "move.patch": "# move the hidden crate\nmove b u+3",
    "push.patch": "# push a crate\nmove c u+1",
    "other.json": JSON.stringify({ ...JSON.parse(crates), states: { apart: { hide: ["c"] } } }),
  };
  const compare = (extra: string[], files: Record<string, string> = variants) =>
    exec(["compare", "s.json", "--variant", "M=move.patch", "--variant", "P=push.patch", ...extra], { "s.json": crates, ...files });

  it("names the state in the header and in the json", () => {
    expect(compare(["--state", "apart"]).out.split("\n")[0]).toBe("compare synthetic \u00b7 state apart \u00b7 base vs M, P");
    expect(compare([]).out.split("\n")[0]).toBe("compare synthetic \u00b7 state default \u00b7 base vs M, P");
    expect(JSON.parse(compare(["--state", "apart", "--format", "json"]).out).state).toBe("apart");
  });

  it("counts the objects a state hides neither as checked nor as moved", () => {
    const json = (extra: string[]) => JSON.parse(compare([...extra, "--format", "json"]).out);
    expect(json([]).moved).toEqual([null, { count: 1, distance: 3 }, { count: 1, distance: 1 }]);
    expect(json(["--state", "apart"]).moved).toEqual([null, { count: 0, distance: 0 }, { count: 1, distance: 1 }]);
    const k2 = json(["--state", "apart"]).checks.find((c: { id: string }) => c.id === "k2");
    expect(k2.status).toEqual(["skip", "skip", "skip"]);
    expect(k2.values).toEqual([null, null, null]);
  });

  it("counts a skipped check as failing", () => {
    expect(JSON.parse(compare(["--state", "apart", "--format", "json"]).out).failing).toEqual([1, 1, 1]);
  });

  it("hides the objects the base scene's state lists in every column, also for a scene variant", () => {
    const r = exec(["compare", "s.json", "--variant", "O=other.json", "--state", "apart", "--format", "json"], { "s.json": crates, "other.json": variants["other.json"] });
    expect(r.code).toBe(0);
    const k2 = JSON.parse(r.out).checks.find((c: { id: string }) => c.id === "k2");
    expect(k2.status).toEqual(["skip", "skip"]);
  });

  it("is a usage error for a state the base scene does not define, and then prints nothing", () => {
    const r = compare(["--state", "night"]);
    expect([r.code, r.out]).toEqual([2, ""]);
    expect(r.err).toMatch(/^error E_USAGE: unknown state 'night'/);
  });
});
