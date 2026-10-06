import { describe, expect, it } from "vitest";
import { serializeScene } from "../../src/core/serialize";
import { parseScene } from "../../src/core/validate";
import { fixtureNames, loadScene, readFixtureText } from "../helpers/fixtures";

describe("serializeScene", () => {
  it("writes two-space indented JSON with a final newline", () => {
    const text = serializeScene(loadScene("overlap"));
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
  });

  for (const name of fixtureNames()) {
    it(`keeps the data of ${name} and is stable when saved twice`, () => {
      const opened = readFixtureText(name);
      const once = serializeScene(parseScene(opened));
      expect(JSON.parse(once)).toEqual(JSON.parse(opened));
      expect(serializeScene(parseScene(once))).toBe(once);
    });
  }

  it("does not reorder keys", () => {
    const text = serializeScene(loadScene("yard"));
    expect(Object.keys(JSON.parse(text))).toEqual(Object.keys(JSON.parse(readFixtureText("yard"))));
  });
});
