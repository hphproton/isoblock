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

  it("names the stage that adds a command", () => {
    expect(usageError(["patch", "a.json", "p.txt"])).toMatch(/'patch' is added in stage 3/);
    expect(usageError(["diff", "a.json", "b.json"])).toMatch(/'diff' is added in stage 3/);
    expect(usageError(["compare", "a.json"])).toMatch(/'compare' is added in stage 3/);
    expect(usageError(["solve", "a.json"])).toMatch(/'solve' is added in stage 4/);
    expect(usageError(["export", "a.json", "--target", "runtime"])).toMatch(/'export' is added in stage 5/);
  });

  it("says when an export target is not scheduled", () => {
    expect(usageError(["export", "a.json", "--target", "phaser"])).toMatch(/'phaser' is not scheduled/);
    expect(usageError(["export", "a.json", "--target=tiled"])).toMatch(/'tiled' is not scheduled/);
  });

  it("names the stage that adds a flag or an output format", () => {
    expect(usageError(["check", "a.json", "--state", "night"])).toMatch(/'--state' is added in stage 6/);
    expect(usageError(["render", "a.json", "--state=night", "-o", "o.svg"])).toMatch(/'--state' is added in stage 6/);
    expect(usageError(["render", "a.json", "-o", "out.png"])).toMatch(/PNG output is added in stage 5/);
    expect(usageError(["check", "a.json", "--only", "a"])).toMatch(/'--only' is added in stage 4/);
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
