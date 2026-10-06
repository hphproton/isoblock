import { describe, expect, it } from "vitest";
import { evaluateRelations } from "../../src/core/relations/evaluate";
import { formatRelationsReport, relationsExitCode, relationsReportJson } from "../../src/core/relations/report";
import { validateScene } from "../../src/core/validate";
import { loadRelationsScene } from "../helpers/fixtures";
import { box, flatScene } from "../helpers/scene";

function scene(relations: unknown[]) {
  return validateScene(flatScene({ objects: [box("a", [0, 0]), box("b", [3, 0])], relations }));
}

describe("relations report", () => {
  it("prints a summary line, then OK|BAD|SKIP <id> <rel>: <message> per relation", () => {
    const s = loadRelationsScene();
    const report = evaluateRelations(s);
    const lines = formatRelationsReport(s, report).split("\n");
    expect(lines).toHaveLength(23);
    expect(lines[0]).toMatch(/^relations relations: 22 relations, 10 satisfied, 9 violated, 3 skipped; hard: 3 of 4 satisfied; soft penalty 17\.9605$/);
    expect(lines[1]).toMatch(/^OK r01 left_of: hard; /);
    expect(lines[2]).toMatch(/^BAD r02 right_of: screen-x separation -3\.4641, wanted 0\.50\.\.3\.00 \(violation 3\.9641\)$/);
    expect(lines[12]).toBe("SKIP r12 facing: facing is not measured yet");
    expect(lines[21]).toMatch(/^BAD r21 against: hard; distance 7\.00, wanted = 0\.00 \(violation 7\.00\)$/);
  });

  it("gives { scene, results } as JSON", () => {
    const s = loadRelationsScene();
    const report = evaluateRelations(s);
    const json = relationsReportJson(s, report);
    expect(Object.keys(json)).toEqual(["scene", "results"]);
    expect(json.scene).toBe("relations");
    expect(json.results).toBe(report.results);
  });

  it("exits 0 when every hard relation is satisfied, else 1; a skipped hard relation is not satisfied", () => {
    expect(relationsExitCode(evaluateRelations(loadRelationsScene()).results)).toBe(1);
    expect(relationsExitCode(evaluateRelations(scene([{ id: "h", a: "a", rel: "left_of", b: "b", hard: true }])).results)).toBe(0);
    expect(relationsExitCode(evaluateRelations(scene([{ id: "s", a: "a", rel: "right_of", b: "b" }])).results)).toBe(0);
    expect(relationsExitCode(evaluateRelations(scene([{ id: "h", a: "a", rel: "facing", b: "b", hard: true }])).results)).toBe(1);
  });

  it("prints one line for a scene without relations, and exits 0", () => {
    const s = scene([]);
    const report = evaluateRelations(s);
    expect(formatRelationsReport(s, report)).toBe("relations synthetic: 0 relations");
    expect(relationsExitCode(report.results)).toBe(0);
  });
});
