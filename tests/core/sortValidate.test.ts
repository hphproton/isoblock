import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IsoblockError } from "../../src/core/errors";
import { validateScene } from "../../src/core/validate";
import { loadSortCases, sortScenePath } from "../helpers/sort";

function court(): Record<string, any> {
  return JSON.parse(readFileSync(sortScenePath(loadSortCases().cases[0]!), "utf8")) as Record<string, any>;
}

function failure(value: unknown): IsoblockError {
  try {
    validateScene(value);
  } catch (e) {
    expect(e).toBeInstanceOf(IsoblockError);
    return e as IsoblockError;
  }
  throw new Error("expected validation to fail");
}

function schemaFailure(mutate: (check: Record<string, any>) => void, pattern: RegExp): void {
  const scene = court();
  mutate(scene.checks[0]);
  const err = failure(scene);
  expect(err.code).toBe("E_SCHEMA");
  expect(err.details.join("\n")).toMatch(pattern);
}

function refFailure(mutate: (check: Record<string, any>) => void, pattern: RegExp): void {
  const scene = court();
  mutate(scene.checks[0]);
  const err = failure(scene);
  expect(err.code).toBe("E_REF");
  expect(err.details.join("\n")).toMatch(pattern);
}

describe("validate: parameters of sort_consistency", () => {
  it("accepts the court fixture and every parameter", () => {
    expect(() => validateScene(court())).not.toThrow();
    const scene = court();
    Object.assign(scene.checks[0], { actor: [0.4, 0.4, 0], step: 0.05, reach: 0, maxPixels: 12.5, area: "yard", ids: ["tree"], "x-note": "free" });
    expect(() => validateScene(scene)).not.toThrow();
  });

  it("needs actor, as three numbers of 0 or more", () => {
    schemaFailure((c) => { delete c.actor; }, /must have required property 'actor'/);
    schemaFailure((c) => { c.actor = [0.4, 0.4]; }, /\/checks\/0\/actor/);
    schemaFailure((c) => { c.actor = [0.4, 0.4, 1, 1]; }, /\/checks\/0\/actor/);
    schemaFailure((c) => { c.actor = [0.4, -0.4, 1]; }, /\/checks\/0\/actor\/1/);
    schemaFailure((c) => { c.actor = ["a", 0.4, 1]; }, /\/checks\/0\/actor\/0/);
  });

  it("needs a step above 0, and a reach and maxPixels of 0 or more", () => {
    schemaFailure((c) => { c.step = 0; }, /\/checks\/0\/step/);
    schemaFailure((c) => { c.step = -0.1; }, /\/checks\/0\/step/);
    schemaFailure((c) => { c.reach = -1; }, /\/checks\/0\/reach/);
    schemaFailure((c) => { c.maxPixels = -1; }, /\/checks\/0\/maxPixels/);
    schemaFailure((c) => { c.maxPixels = "many"; }, /\/checks\/0\/maxPixels/);
  });

  it("needs a non-empty area and a non-empty list of ids", () => {
    schemaFailure((c) => { c.area = ""; }, /\/checks\/0\/area/);
    schemaFailure((c) => { c.ids = []; }, /\/checks\/0\/ids/);
    schemaFailure((c) => { c.ids = "tree"; }, /\/checks\/0\/ids/);
  });

  it("rejects an unknown parameter (typos are errors)", () => {
    schemaFailure((c) => { c.maxPixel = 5; }, /must NOT have additional properties: "maxPixel"/);
    schemaFailure((c) => { c.region = "view"; }, /"region"/);
  });

  it("names an existing zone in area and existing objects in ids (E_REF)", () => {
    refFailure((c) => { c.area = "lake"; }, /check "s1".*unknown zone "lake"/);
    refFailure((c) => { c.ids = ["tree", "ghost"]; }, /check "s1".*unknown object "ghost"/);
  });

  it("accepts a zone of any kind, also one without points (the check is skipped, not invalid)", () => {
    const scene = court();
    scene.checks[0].area = "mark";
    expect(() => validateScene(scene)).not.toThrow();
  });

  it("still accepts state_stable with only id and check, as a check that is not implemented", () => {
    const scene = court();
    scene.checks.push({ id: "later", check: "state_stable", anything: { goes: true } });
    expect(() => validateScene(scene)).not.toThrow();
  });
});
