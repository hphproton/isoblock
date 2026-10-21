import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IsoblockError } from "../../src/core/errors";
import { validateScene } from "../../src/core/validate";
import { repoRoot } from "../helpers/fixtures";

function measures(): Record<string, any> {
  return JSON.parse(readFileSync(join(repoRoot, "tests/fixtures/measures/measures.scene.json"), "utf8")) as Record<string, any>;
}

function schemaFailure(mutate: (scene: Record<string, any>) => void): IsoblockError {
  const scene = measures();
  mutate(scene);
  try {
    validateScene(scene);
  } catch (e) {
    expect(e).toBeInstanceOf(IsoblockError);
    return e as IsoblockError;
  }
  throw new Error("expected validation to fail");
}

const check = (scene: Record<string, any>, id: string): Record<string, any> => scene.checks.find((c: any) => c.id === id);

describe("validate: stage 9 measures", () => {
  it("accepts the measures fixture", () => {
    expect(validateScene(measures()).id).toBe("measures");
  });

  it("rejects maxOutside unless the measure is drawn", () => {
    const bare = schemaFailure((s) => { check(s, "foot").maxOutside = 0.2; });
    const named = schemaFailure((s) => { check(s, "foot").measure = "footprint"; check(s, "foot").maxOutside = 0.2; });
    expect(bare.code).toBe("E_SCHEMA");
    expect(named.code).toBe("E_SCHEMA");
    const drawn = measures();
    check(drawn, "drawn").maxOutside = 0.2;
    expect(() => validateScene(drawn)).not.toThrow();
  });

  it("rejects a measure outside the two names, and a maxOutside outside 0 to 1", () => {
    expect(schemaFailure((s) => { check(s, "drawn").measure = "box"; }).code).toBe("E_SCHEMA");
    expect(schemaFailure((s) => { check(s, "drawn").maxOutside = 1.1; }).code).toBe("E_SCHEMA");
    expect(schemaFailure((s) => { check(s, "size_height").measure = "width"; }).code).toBe("E_SCHEMA");
  });

  it("requires lane_apart to name a lane and a lane or zone target", () => {
    expect(schemaFailure((s) => { delete check(s, "walks_near").target; }).code).toBe("E_SCHEMA");
    expect(schemaFailure((s) => { check(s, "walks_near").target = "crate"; }).code).toBe("E_SCHEMA");
    expect(schemaFailure((s) => { check(s, "walks_near").min = -1; }).code).toBe("E_SCHEMA");
  });

  it("rejects a lane or a zone that does not exist", () => {
    const lane = schemaFailure((s) => { check(s, "walks_near").lane = "ghost"; });
    const zone = schemaFailure((s) => { check(s, "on_plaza").target = "zone:ghost"; });
    expect(lane.code).toBe("E_REF");
    expect(lane.details.join("\n")).toMatch(/lane "ghost"/);
    expect(zone.code).toBe("E_REF");
    expect(zone.details.join("\n")).toMatch(/zone "ghost"/);
  });
});
