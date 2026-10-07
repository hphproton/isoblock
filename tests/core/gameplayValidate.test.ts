import { describe, expect, it } from "vitest";
import { IsoblockError } from "../../src/core/errors";
import { validateScene } from "../../src/core/validate";
import { rawFixture } from "../helpers/fixtures";
import { makeScene } from "../helpers/scene";
import { walkScenePath } from "../helpers/states";
import { readFileSync } from "node:fs";

function walk(): Record<string, any> {
  return JSON.parse(readFileSync(walkScenePath(), "utf8")) as Record<string, any>;
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

function schemaFailure(mutate: (scene: Record<string, any>) => void, pattern?: RegExp): void {
  const scene = walk();
  mutate(scene);
  const err = failure(scene);
  expect(err.code).toBe("E_SCHEMA");
  if (pattern !== undefined) expect(err.details.join("\n")).toMatch(pattern);
}

function refFailure(mutate: (scene: Record<string, any>) => void, pattern: RegExp): void {
  const scene = walk();
  mutate(scene);
  const err = failure(scene);
  expect(err.code).toBe("E_REF");
  expect(err.details.join("\n")).toMatch(pattern);
}

const check = (scene: Record<string, any>, id: string): Record<string, any> => scene.checks.find((c: any) => c.id === id);

describe("validate: states", () => {
  it("accepts the walk fixture and a state with extension keys or without hide", () => {
    const scene = walk();
    scene.states.night = { "x-note": "dark", hide: [] };
    scene.states.plain = {};
    expect(() => validateScene(scene)).not.toThrow();
  });

  it("accepts only hide, plus x- keys", () => {
    schemaFailure((s) => { s.states.open.move = { barrier1: [0, 0] }; }, /\/states\/open: must NOT have additional properties: "move"/);
    schemaFailure((s) => { s.states.open.show = ["barrier1"]; }, /"show"/);
  });

  it("needs hide to be a list of strings", () => {
    schemaFailure((s) => { s.states.open.hide = "barrier1"; }, /\/states\/open\/hide/);
    schemaFailure((s) => { s.states.open.hide = [1]; }, /\/states\/open\/hide\/0/);
  });

  it("still rejects a state that hides an unknown object (E_REF)", () => {
    refFailure((s) => { s.states.open.hide = ["ghost"]; }, /state "open".*"ghost"/);
  });
});

describe("validate: parameters of reachable", () => {
  it("accepts a point as [u, v], lane:<id> or anchor:<object>/<anchor>", () => {
    const scene = walk();
    check(scene, "k1").from = [1, 2];
    check(scene, "k1").to = "lane:back";
    expect(() => validateScene(scene)).not.toThrow();
  });

  it("requires from and to", () => {
    schemaFailure((s) => { delete check(s, "k1").from; });
    schemaFailure((s) => { delete check(s, "k1").to; });
  });

  it("rejects a point that is neither a pair of numbers, a lane nor an anchor", () => {
    schemaFailure((s) => { check(s, "k1").from = "somewhere"; });
    schemaFailure((s) => { check(s, "k1").from = [1]; });
    schemaFailure((s) => { check(s, "k1").to = "anchor:bench1"; });
    schemaFailure((s) => { check(s, "k1").to = "lane:"; });
  });

  it("rejects unknown keys, a negative radius, a step of 0 and a negative max", () => {
    schemaFailure((s) => { check(s, "k1").speed = 2; }, /"speed"/);
    schemaFailure((s) => { check(s, "k1").radius = -0.1; });
    schemaFailure((s) => { check(s, "k1").step = 0; });
    schemaFailure((s) => { check(s, "k1").max = -1; });
    schemaFailure((s) => { check(s, "k1").ignore = "hedge1"; });
  });

  it("accepts a radius of 0 and extension keys", () => {
    const scene = walk();
    check(scene, "k1").radius = 0;
    check(scene, "k1")["x-owner"] = "level design";
    expect(() => validateScene(scene)).not.toThrow();
  });

  it("rejects a lane, an anchor, an object or a zone that does not exist (E_REF)", () => {
    refFailure((s) => { check(s, "k1").from = "lane:ghost"; }, /check "k1".*lane "ghost"/);
    refFailure((s) => { check(s, "k1").to = "anchor:ghost/seat1"; }, /check "k1".*anchor "anchor:ghost\/seat1"/);
    refFailure((s) => { check(s, "k1").to = "anchor:bench1/ghost"; }, /anchor "anchor:bench1\/ghost"/);
    refFailure((s) => { check(s, "k7").area = "ghost"; }, /check "k7".*zone "ghost"/);
    refFailure((s) => { check(s, "k8").ignore = ["ghost"]; }, /check "k8".*object "ghost"/);
  });

  it("finds an anchor whose object id contains a slash", () => {
    const scene: Record<string, any> = {
      ...makeScene({
        types: { bench: { size: [1, 1, 1], anchors: [{ id: "seat1", at: [0.5, 0.5, 0], kind: "seat" }] } },
        objects: [{ id: "row/1", type: "bench", pos: [0, 0] }],
        zones: [{ id: "lawn", kind: "walkable", points: [[0, 0], [4, 0], [4, 4], [0, 4]] }],
        checks: [{ id: "k", check: "reachable", from: [3, 3], to: "anchor:row/1/seat1" }],
      }),
    };
    expect(() => validateScene(scene)).not.toThrow();
    scene.checks[0].to = "anchor:row/1/ghost";
    expect(failure(scene).code).toBe("E_REF");
  });
});

describe("validate: parameters of capacity and min_screen_size", () => {
  it("requires kind and min for capacity, and min and target for min_screen_size", () => {
    schemaFailure((s) => { delete check(s, "s1").kind; });
    schemaFailure((s) => { delete check(s, "s1").min; });
    schemaFailure((s) => { delete check(s, "m1").min; });
    schemaFailure((s) => { delete check(s, "m1").target; });
  });

  it("rejects a body that is not 2 non-negative numbers, an empty ids list and a bad screenWidth", () => {
    schemaFailure((s) => { check(s, "s4").body = [0.6]; });
    schemaFailure((s) => { check(s, "s4").body = [0.6, -1]; });
    schemaFailure((s) => { check(s, "s1").ids = []; });
    schemaFailure((s) => { check(s, "s3").allow = "rock1"; });
    schemaFailure((s) => { check(s, "m2").screenWidth = 0; });
    schemaFailure((s) => { check(s, "m1").height = 3; }, /"height"/);
  });

  it("rejects objects that do not exist (E_REF)", () => {
    refFailure((s) => { check(s, "s1").ids = ["ghost"]; }, /check "s1".*object "ghost"/);
    refFailure((s) => { check(s, "s3").allow = ["ghost"]; }, /check "s3".*object "ghost"/);
    refFailure((s) => { check(s, "m1").target = "ghost"; }, /check "m1".*object "ghost"/);
  });

  it("does not look for a kind: kinds are free strings", () => {
    const scene = walk();
    check(scene, "s1").kind = "nothing-has-this";
    expect(() => validateScene(scene)).not.toThrow();
  });
});

describe("validate: the lane fixture keeps its reachable check", () => {
  it("resolves lane:L3 of the lane fixture", () => {
    const scene = rawFixture("lane");
    expect(scene.checks.at(-1).from).toBe("lane:L3");
    expect(() => validateScene(scene)).not.toThrow();
    scene.checks.at(-1).from = "lane:L9";
    expect(failure(scene).code).toBe("E_REF");
  });
});
