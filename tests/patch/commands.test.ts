import { describe, expect, it } from "vitest";
import { parseCommand } from "../../src/core/patch/commands";
import { tokenize } from "../../src/core/patch/tokens";

const parse = (line: string) => parseCommand(tokenize(line));

function code(line: string): string {
  try {
    parse(line);
  } catch (e) {
    return (e as { code: string }).code;
  }
  return "none";
}

describe("parseCommand: move", () => {
  it("reads one or two signed offsets in either order", () => {
    expect(parse("move bench u-0.5 v+0.2")).toEqual({ cmd: "move", id: "bench", du: -0.5, dv: 0.2 });
    expect(parse("move bench v+0.2 u-0.5")).toEqual({ cmd: "move", id: "bench", du: -0.5, dv: 0.2 });
    expect(parse("move bench v+3")).toEqual({ cmd: "move", id: "bench", dv: 3 });
    expect(parse("move bench u+.5")).toEqual({ cmd: "move", id: "bench", du: 0.5 });
  });

  it("rejects an axis given twice, a missing sign, a bad number and no offset", () => {
    for (const line of ["move b u+1 u+2", "move b u1", "move b u+x", "move b w+1", "move b", "move", "move b u+1 v+1 v+2"]) {
      expect(code(line), line).toBe("E_PATCH");
    }
  });
});

describe("parseCommand: rot", () => {
  it("accepts the four rotations", () => {
    for (const r of [0, 90, 180, 270]) expect(parse(`rot a ${r}`)).toEqual({ cmd: "rot", id: "a", rot: r });
  });

  it("rejects other angles and missing arguments", () => {
    for (const line of ["rot a 45", "rot a", "rot a 90 90", "rot a 90.0"]) expect(code(line), line).toBe("E_PATCH");
  });
});

describe("parseCommand: set", () => {
  it("reads the value as JSON, else as a string", () => {
    expect(parse("set /a/b 2.5")).toMatchObject({ cmd: "set", pointer: "/a/b", value: 2.5 });
    expect(parse("set /a/b true")).toMatchObject({ value: true });
    expect(parse("set /a/b null")).toMatchObject({ value: null });
    expect(parse('set /a/b "[1, 2]"')).toMatchObject({ value: [1, 2] });
    expect(parse("set /a/b hello")).toMatchObject({ value: "hello" });
    expect(parse('set /a/b "two words"')).toMatchObject({ value: "two words" });
  });

  it("reads note= after the value", () => {
    expect(parse('set /a 1 note="two words"')).toEqual({ cmd: "set", pointer: "/a", value: 1, note: "two words" });
  });

  it("rejects a pointer that is not below the root, a missing value and stray tokens", () => {
    for (const line of ["set a 1", 'set "" 1', "set /a", "set /a 1 2", "set /a 1 note=x extra", "set /a note=x 1"]) {
      expect(code(line), line).toBe("E_PATCH");
    }
  });
});

describe("parseCommand: lock", () => {
  it("collects the locks once each", () => {
    expect(parse("lock a pos rot pos")).toEqual({ cmd: "lock", id: "a", locks: ["pos", "rot"] });
    expect(parse("lock a /types/t/size/0 pos.u")).toEqual({ cmd: "lock", id: "a", locks: ["/types/t/size/0", "pos.u"] });
  });

  it("rejects an unknown lock and a missing lock", () => {
    expect(code("lock a size")).toBe("E_PATCH");
    expect(code("lock a")).toBe("E_PATCH");
  });
});

describe("parseCommand: relate", () => {
  it("builds the relation in the documented key order", () => {
    const c = parse('relate bench in_front_of tree gap 1..1.5 axis v t 0..1 min 2 hard weight 3 id=r9 source="a b"');
    expect(c).toMatchObject({ cmd: "relate", id: "r9" });
    expect(Object.keys((c as { fields: object }).fields)).toEqual(["a", "rel", "b", "gap", "axis", "t", "min", "hard", "weight", "source"]);
    expect((c as { fields: object }).fields).toEqual({
      a: "bench", rel: "in_front_of", b: "tree", gap: [1, 1.5], axis: "v", t: [0, 1], min: 2, hard: true, weight: 3, source: "a b",
    });
  });

  it("always writes hard, false by default, and leaves the id open", () => {
    expect(parse("relate a left_of b")).toEqual({ cmd: "relate", fields: { a: "a", rel: "left_of", b: "b", hard: false } });
  });

  it("reads negative and decimal ranges", () => {
    expect(parse("relate a gap b gap -1..2.5")).toMatchObject({ fields: { gap: [-1, 2.5] } });
    expect(parse("relate a gap b gap .5..1")).toMatchObject({ fields: { gap: [0.5, 1] } });
  });

  it("rejects missing parts, repeated and unknown options, and bad values", () => {
    for (const line of [
      "relate a left_of", "relate a left_of b gap 1", "relate a left_of b gap 1..", "relate a left_of b gap 1..2 gap 1..2",
      "relate a left_of b hard hard", "relate a left_of b axis w", "relate a left_of b axis", "relate a left_of b min",
      "relate a left_of b weight x", "relate a left_of b id=", "relate a left_of b colour red",
    ]) {
      expect(code(line), line).toBe("E_PATCH");
    }
  });
});

describe("parseCommand: other names", () => {
  it("names stage 4 for solve (E_USAGE)", () => {
    expect(code("solve only=a")).toBe("E_USAGE");
    expect(() => parse("solve")).toThrowError(/stage 4/);
  });

  it("rejects an unknown command", () => {
    expect(code("unlock a pos")).toBe("E_PATCH");
    expect(code("Move a u+1")).toBe("E_PATCH");
  });
});
