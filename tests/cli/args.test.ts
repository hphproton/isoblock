import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/cli/args";

function usageError(argv: string[]): string {
  try {
    parseArgs(argv);
  } catch (e) {
    expect((e as { code: string }).code).toBe("E_USAGE");
    return (e as Error).message;
  }
  throw new Error("expected a usage error");
}

describe("parseArgs", () => {
  it("parses the four stage 1 commands", () => {
    expect(parseArgs(["validate", "a.json"])).toEqual({ kind: "run", command: "validate", file: "a.json", json: false });
    expect(parseArgs(["describe", "a.json"])).toEqual({ kind: "run", command: "describe", file: "a.json", json: false });
    expect(parseArgs(["check", "a.json", "--json"])).toEqual({ kind: "run", command: "check", file: "a.json", json: true });
    expect(parseArgs(["check", "--json", "a.json"])).toEqual({ kind: "run", command: "check", file: "a.json", json: true });
    expect(parseArgs(["render", "a.json", "-o", "out.svg"])).toEqual({
      kind: "run", command: "render", file: "a.json", json: false, output: "out.svg",
    });
    expect(parseArgs(["render", "a.json", "-o=out.svg"])).toMatchObject({ output: "out.svg" });
  });

  it("returns help for --help, -h and no arguments to help", () => {
    expect(parseArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseArgs(["-h"])).toEqual({ kind: "help" });
    expect(parseArgs(["check", "--help"])).toEqual({ kind: "help" });
  });

  it("rejects a missing command, an unknown command and a missing file", () => {
    expect(usageError([])).toMatch(/missing command/);
    expect(usageError(["frobnicate", "a.json"])).toMatch(/unknown command 'frobnicate'/);
    expect(usageError(["check"])).toMatch(/missing scene file/);
    expect(usageError(["check", "a.json", "b.json"])).toMatch(/unexpected argument 'b.json'/);
  });

  it("parses export with its target, output and gen-bbox flags", () => {
    expect(parseArgs(["export", "a.json", "--target", "runtime"])).toEqual({ kind: "export", file: "a.json", target: "runtime" });
    expect(parseArgs(["export", "a.json", "--target=runtime", "-o", "r.json"])).toEqual({
      kind: "export", file: "a.json", target: "runtime", output: "r.json",
    });
    expect(parseArgs(["export", "a.json", "--target", "gen-bbox"])).toEqual({ kind: "export", file: "a.json", target: "gen-bbox" });
    expect(parseArgs(["export", "--target", "gen-bbox", "a.json", "--bbox-units", "norm1000", "--bbox-order=yxyx", "-o", "b.json"])).toEqual({
      kind: "export", file: "a.json", target: "gen-bbox", bboxUnits: "norm1000", bboxOrder: "yxyx", output: "b.json",
    });
  });

  it("rejects export without a target, with an unknown target or with bad gen-bbox values", () => {
    expect(usageError(["export", "a.json"])).toMatch(/export needs --target runtime or gen-bbox/);
    expect(usageError(["export", "a.json", "--target", "mesh"])).toMatch(/unknown export target 'mesh'/);
    expect(usageError(["export", "a.json", "--target", "gen-bbox", "--bbox-units", "em"])).toMatch(/--bbox-units must be px or norm1000/);
    expect(usageError(["export", "a.json", "--target", "gen-bbox", "--bbox-order", "xy"])).toMatch(/--bbox-order must be xyxy or yxyx/);
    expect(usageError(["export", "a.json", "--target"])).toMatch(/flag '--target' needs a value/);
    expect(usageError(["export"])).toMatch(/missing scene file|export needs --target/);
  });

  it("rejects the bbox flags with the runtime target and flags of other commands", () => {
    expect(usageError(["export", "a.json", "--target", "runtime", "--bbox-units", "px"])).toMatch(/--bbox-units applies to the gen-bbox target only/);
    expect(usageError(["export", "a.json", "--target", "runtime", "--bbox-order", "xyxy"])).toMatch(/--bbox-order applies to the gen-bbox target only/);
    expect(usageError(["export", "a.json", "--target", "runtime", "--json"])).toMatch(/'--json' does not apply to 'export'/);
    expect(usageError(["check", "a.json", "--target", "runtime"])).toMatch(/'--target' does not apply to 'check'/);
    expect(usageError(["render", "a.json", "-o", "o.svg", "--bbox-units", "px"])).toMatch(/'--bbox-units' does not apply to 'render'/);
  });

  it("says when an export target is not scheduled", () => {
    for (const target of ["godot", "phaser", "tiled"]) {
      expect(usageError(["export", "a.json", "--target", target])).toMatch(new RegExp(`export target '${target}' is not scheduled`));
    }
    expect(usageError(["export", "a.json", "--target=tiled"])).toMatch(/'tiled' is not scheduled/);
  });

  it("accepts PNG and SVG output for render, and rejects other extensions", () => {
    expect(parseArgs(["render", "a.json", "-o", "out.png"])).toMatchObject({ command: "render", output: "out.png" });
    expect(parseArgs(["render", "a.json", "-o", "OUT.PNG"])).toMatchObject({ output: "OUT.PNG" });
    expect(usageError(["render", "a.json", "-o", "out.jpg"])).toMatch(/must end in \.svg or \.png/);
  });

  it("names the stage that adds a flag or an output format", () => {
    expect(usageError(["check", "a.json", "--state", "night"])).toMatch(/'--state' is added in stage 6/);
    expect(usageError(["render", "a.json", "--state=night", "-o", "o.svg"])).toMatch(/'--state' is added in stage 6/);
    expect(usageError(["check", "a.json", "--only", "a"])).toMatch(/'--only' does not apply to 'check'/);
  });

  it("parses patch, diff and compare", () => {
    expect(parseArgs(["patch", "a.json", "p.txt"])).toEqual({ kind: "patch", file: "a.json", patchFile: "p.txt", json: false, dryRun: false });
    expect(parseArgs(["patch", "a.json", "p.txt", "-o", "b.json", "--dry-run", "--json"])).toEqual({
      kind: "patch", file: "a.json", patchFile: "p.txt", json: true, dryRun: true, output: "b.json",
    });
    expect(parseArgs(["patch", "--json", "a.json", "-o=b.json", "p.txt"])).toMatchObject({ output: "b.json", json: true });
    expect(parseArgs(["diff", "a.json", "b.json"])).toEqual({ kind: "diff", file: "a.json", other: "b.json", json: false });
    expect(parseArgs(["diff", "a.json", "b.json", "--json"])).toMatchObject({ json: true });
    expect(parseArgs(["compare", "a.json", "--variant", "A=a.patch", "--variant=B=b.patch"])).toEqual({
      kind: "compare", file: "a.json", variants: [{ name: "A", file: "a.patch" }, { name: "B", file: "b.patch" }], format: "text",
    });
    for (const format of ["text", "md", "json"]) {
      expect(parseArgs(["compare", "a.json", "--variant", "A=a", "--format", format])).toMatchObject({ format });
    }
    expect(parseArgs(["compare", "a.json", "--variant", "A=dir/x=y.patch"])).toMatchObject({ variants: [{ name: "A", file: "dir/x=y.patch" }] });
  });

  it("needs the files each of patch, diff and compare takes", () => {
    expect(usageError(["patch", "a.json"])).toMatch(/missing patch file/);
    expect(usageError(["patch"])).toMatch(/missing scene file/);
    expect(usageError(["patch", "a.json", "p.txt", "x"])).toMatch(/unexpected argument 'x'/);
    expect(usageError(["diff", "a.json"])).toMatch(/missing second scene file/);
    expect(usageError(["diff", "a.json", "b.json", "c.json"])).toMatch(/unexpected argument 'c.json'/);
  });

  it("takes 1 to 4 variants with unique names written NAME=FILE", () => {
    const base = ["compare", "a.json"];
    expect(usageError(base)).toMatch(/at least one --variant/);
    expect(usageError([...base, "--variant", "A"])).toMatch(/must be written NAME=FILE/);
    expect(usageError([...base, "--variant", "=a.patch"])).toMatch(/must be written NAME=FILE/);
    expect(usageError([...base, "--variant", "A="])).toMatch(/must be written NAME=FILE/);
    expect(usageError([...base, "--variant", "A=a", "--variant", "A=b"])).toMatch(/'A' is used twice/);
    expect(usageError([...base, "--variant", "base=a"])).toMatch(/'base' is reserved/);
    const five = ["A", "B", "C", "D", "E"].flatMap((n) => ["--variant", `${n}=${n}.patch`]);
    expect(usageError([...base, ...five])).toMatch(/at most 4 variants/);
    expect(parseArgs([...base, ...five.slice(0, 8)])).toMatchObject({ kind: "compare" });
  });

  it("says what is not available for compare: --state names stage 6, --render is not scheduled, formats are checked", () => {
    const base = ["compare", "a.json", "--variant", "A=a"];
    expect(usageError([...base, "--state", "night"])).toMatch(/'--state' is added in stage 6/);
    expect(usageError([...base, "--render"])).toMatch(/'--render' is not scheduled/);
    expect(usageError([...base, "--format", "html"])).toMatch(/unknown format 'html'/);
    expect(usageError([...base, "--format"])).toMatch(/'--format' needs a value/);
  });

  it("keeps flags with the commands they belong to", () => {
    expect(usageError(["patch", "a.json", "p", "--format", "md"])).toMatch(/'--format' does not apply to 'patch'/);
    expect(usageError(["check", "a.json", "--dry-run"])).toMatch(/'--dry-run' does not apply to 'check'/);
    expect(usageError(["diff", "a.json", "b.json", "-o", "x.json"])).toMatch(/'-o' does not apply to 'diff'/);
    expect(usageError(["compare", "a.json", "--json"])).toMatch(/'--json' does not apply to 'compare'/);
    expect(usageError(["render", "a.json", "--variant", "A=a", "-o", "o.svg"])).toMatch(/'--variant' does not apply to 'render'/);
    expect(usageError(["validate", "a.json", "--render"])).toMatch(/unknown flag '--render'/);
  });

  it("rejects unknown flags, flags of other commands and a bad output name", () => {
    expect(usageError(["check", "a.json", "--nope"])).toMatch(/unknown flag '--nope'/);
    expect(usageError(["validate", "a.json", "--json"])).toMatch(/'--json' does not apply to 'validate'/);
    expect(usageError(["check", "a.json", "-o", "x.svg"])).toMatch(/'-o' does not apply to 'check'/);
    expect(usageError(["render", "a.json"])).toMatch(/render needs -o/);
    expect(usageError(["render", "a.json", "-o"])).toMatch(/'-o' needs a value/);
    expect(usageError(["render", "a.json", "-o", "out.jpg"])).toMatch(/must end in \.svg/);
  });
});
