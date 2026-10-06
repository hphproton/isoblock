import { describe, expect, it } from "vitest";
import { pointerOf, pointerTokens, resolvePointer } from "../../src/core/pointer";
import { percent, plain } from "../../src/core/format";
import { IsoblockError, exitCodeFor } from "../../src/core/errors";

describe("pointer", () => {
  it("splits and decodes tokens", () => {
    expect(pointerTokens("")).toEqual([]);
    expect(pointerTokens("/a/0/b~1c/d~0e")).toEqual(["a", "0", "b/c", "d~e"]);
  });

  it("resolves objects and arrays, and reports what is missing", () => {
    const doc = { a: [{ b: 5 }], "x/y": 1 };
    expect(resolvePointer(doc, "/a/0/b")).toEqual({ found: true, value: 5 });
    expect(resolvePointer(doc, "/x~1y")).toEqual({ found: true, value: 1 });
    expect(resolvePointer(doc, "").found).toBe(true);
    expect(resolvePointer(doc, "/a/1").found).toBe(false);
    expect(resolvePointer(doc, "/a/01").found).toBe(false);
    expect(resolvePointer(doc, "/a/0/c").found).toBe(false);
    expect(resolvePointer(doc, "/a/0/b/c").found).toBe(false);
    expect(resolvePointer(doc, "/toString").found).toBe(false);
  });
});

describe("pointerOf", () => {
  it("builds a JSON Pointer and escapes ~ and /", () => {
    expect(pointerOf()).toBe("");
    expect(pointerOf("types", "post", "size", 2)).toBe("/types/post/size/2");
    expect(pointerOf("types", "a/b~c")).toBe("/types/a~1b~0c");
  });

  it("round-trips through pointerTokens", () => {
    const tokens = ["types", "x/y", "~", "0"];
    expect(pointerTokens(pointerOf(...tokens))).toEqual(tokens);
  });
});

describe("format helpers", () => {
  it("prints plain numbers and whole percentages", () => {
    expect(plain(150)).toBe("150");
    expect(plain(20.5)).toBe("20.5");
    expect(plain(1 / 3)).toBe("0.3333");
    expect(percent(0.401)).toBe(40);
    expect(percent(0.7604)).toBe(76);
  });
});

describe("errors", () => {
  it("maps error codes to exit codes", () => {
    for (const code of ["E_IO", "E_JSON_PARSE", "E_SCHEMA", "E_REF", "E_USAGE"] as const) expect(exitCodeFor(code)).toBe(2);
    expect(exitCodeFor("E_INTERNAL")).toBe(70);
  });

  it("carries a code and details", () => {
    const e = new IsoblockError("E_REF", "bad", ["one", "two"]);
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("E_REF");
    expect(e.details).toEqual(["one", "two"]);
  });
});
