import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { serializeScene } from "../../src/core/serialize";
import { solveScene } from "../../src/core/solver/solve";
import { parseScene } from "../../src/core/validate";
import { repoRoot } from "../helpers/fixtures";
import { expectConstraints } from "../helpers/solver";

const dir = join(repoRoot, "tests/fixtures/paths/solver");

interface Expected {
  readonly scene: string;
  readonly only: readonly string[] | null;
  readonly rotate: boolean;
  readonly status: "solved" | "conflict";
  readonly conflict: readonly string[];
  readonly hardViolated: readonly string[] | null;
  readonly maxSoftPenalty: number | null;
  readonly maxDistance: number | null;
  readonly unchanged: readonly string[];
  readonly rot: Readonly<Record<string, number>> | null;
}

function names(): string[] {
  return readdirSync(dir).filter((file) => file.endsWith(".scene.json")).map((file) => file.slice(0, -".scene.json".length)).sort();
}

describe("path solver fixtures (SPEC 8, 17)", () => {
  const fixtureNames = names();

  it("finds the two fixtures", () => {
    expect(fixtureNames).toEqual(["turn", "turn-locked"]);
  });

  for (const name of fixtureNames) {
    it(`${name} meets its expected file`, () => {
      const expected = JSON.parse(readFileSync(join(dir, `${name}.expected.json`), "utf8")) as Expected;
      const scene = parseScene(readFileSync(join(dir, `${name}.scene.json`), "utf8"));
      const { report, proposal } = solveScene(scene, expected.only ?? undefined, expected.rotate);
      expect(report.scene).toBe(expected.scene);
      expect(report.status).toBe(expected.status);
      expect(report.conflict).toEqual(expected.conflict);
      if (expected.hardViolated !== null) expect(report.hardViolated).toEqual(expected.hardViolated);
      if (expected.maxSoftPenalty !== null) expect(report.softPenalty).toBeLessThanOrEqual(expected.maxSoftPenalty);
      if (expected.maxDistance !== null) expect(report.distance).toBeLessThanOrEqual(expected.maxDistance);
      for (const id of expected.unchanged) {
        const index = scene.objects.findIndex((object) => object.id === id);
        expect(proposal.objects[index]?.pos, `${id} unchanged`).toEqual(scene.objects[index]?.pos);
      }
      if (report.status === "solved") expectConstraints(scene, proposal);
      if (expected.rot !== null) {
        for (const object of proposal.objects) expect(object.rot ?? 0, object.id).toBe(expected.rot[object.id] ?? 0);
      }
    });

    it(`${name} gives byte-identical output on a second run`, () => {
      const expected = JSON.parse(readFileSync(join(dir, `${name}.expected.json`), "utf8")) as Expected;
      const run = () => solveScene(parseScene(readFileSync(join(dir, `${name}.scene.json`), "utf8")), expected.only ?? undefined, expected.rotate);
      const first = run();
      const second = run();
      expect(JSON.stringify(second.report)).toBe(JSON.stringify(first.report));
      expect(serializeScene(second.proposal)).toBe(serializeScene(first.proposal));
    });
  }
});
