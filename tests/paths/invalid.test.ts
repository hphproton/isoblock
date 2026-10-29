import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { memoryIo } from "../helpers/cli";
import { repoRoot } from "../helpers/fixtures";

const dir = join(repoRoot, "tests/fixtures/paths/invalid");
const cases = JSON.parse(readFileSync(join(dir, "cases.json"), "utf8")).cases as {
  file: string;
  code: string;
  scene: string | null;
  contains: string[];
  excludes: string[];
}[];

describe("path invalid fixtures (SPEC 6, 17)", () => {
  it("finds the 6 fixtures", () => {
    expect(cases).toHaveLength(6);
  });

  for (const c of cases) {
    it(`${c.file} matches its code, scene and detail rules`, () => {
      const source = readFileSync(join(dir, c.file), "utf8");
      const cap = memoryIo({ [c.file]: source });
      const code = run(["validate", "--json", c.file], cap.io);
      expect(code, c.file).toBe(2);
      expect(cap.err(), c.file).toBe("");
      const body = JSON.parse(cap.out()) as { ok: boolean; scene: string | null; error: { code: string; message: string; details: string[] } };
      expect(body.ok).toBe(false);
      expect(body.scene).toBe(c.scene);
      expect(body.error.code).toBe(c.code);
      const text = [body.error.message, ...body.error.details].join("\n");
      for (const part of c.contains) expect(text, part).toContain(part);
      for (const part of c.excludes) expect(text, part).not.toContain(part);
    });
  }
});
