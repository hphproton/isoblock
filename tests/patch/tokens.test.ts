import { describe, expect, it } from "vitest";
import { tokenize } from "../../src/core/patch/tokens";

describe("tokenize", () => {
  it("splits on spaces and tabs and ignores extra blanks", () => {
    expect(tokenize("move  bench\tu+1   v-2 ")).toEqual(["move", "bench", "u+1", "v-2"]);
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });

  it("groups text in double quotes, also in the middle of a token", () => {
    expect(tokenize('set /a "two words"')).toEqual(["set", "/a", "two words"]);
    expect(tokenize('set /a note="two words"')).toEqual(["set", "/a", "note=two words"]);
  });

  it("keeps an empty quoted string as an empty token", () => {
    expect(tokenize('set /a ""')).toEqual(["set", "/a", ""]);
  });

  it("reads \\\" and \\\\ inside quotes, so that a JSON value can be written", () => {
    expect(tokenize('set /a "[\\"x\\", \\"y\\"]"')).toEqual(["set", "/a", '["x", "y"]']);
    expect(tokenize('note="a\\\\b"')).toEqual(["note=a\\b"]);
  });

  it("leaves other backslashes alone", () => {
    expect(tokenize('note="a\\tb"')).toEqual(["note=a\\tb"]);
  });

  it("rejects a quote that is not closed with E_PATCH", () => {
    expect(() => tokenize('set /a "open')).toThrowError(expect.objectContaining({ code: "E_PATCH" }));
  });
});
