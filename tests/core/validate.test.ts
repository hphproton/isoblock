import { describe, expect, it } from "vitest";
import { IsoblockError } from "../../src/core/errors";
import { parseScene, validateScene } from "../../src/core/validate";
import { fixtureNames, loadScene, rawFixture } from "../helpers/fixtures";

function failure(value: unknown): IsoblockError {
  try {
    validateScene(value);
  } catch (e) {
    expect(e).toBeInstanceOf(IsoblockError);
    return e as IsoblockError;
  }
  throw new Error("expected validation to fail");
}

describe("validate: fixtures", () => {
  it("finds the stage 1 fixtures", () => {
    expect(fixtureNames()).toEqual(expect.arrayContaining(["lane", "overlap", "visible", "yard"]));
  });

  for (const name of fixtureNames()) {
    it(`accepts ${name}`, () => {
      expect(loadScene(name).id).toBe(name);
    });
  }
});

describe("validate: syntax and schema", () => {
  it("reports malformed JSON as E_JSON_PARSE", () => {
    expect(() => parseScene("{ nope")).toThrowError(expect.objectContaining({ code: "E_JSON_PARSE" }));
  });

  it("rejects a non-object document", () => {
    expect(failure([]).code).toBe("E_SCHEMA");
  });

  it("rejects a file with a wrong schema value and missing keys", () => {
    const err = failure({ schema: "x" });
    expect(err.code).toBe("E_SCHEMA");
    expect(err.details.join("\n")).toMatch(/camera/);
    expect(err.details).toContain('/schema: must be "isoblock/1"');
  });

  it("rejects unknown keys but allows x- extensions", () => {
    const scene = rawFixture("yard");
    scene.objects[0].colour = "red";
    expect(failure(scene).code).toBe("E_SCHEMA");
    delete scene.objects[0].colour;
    scene.objects[0]["x-note"] = { any: "thing" };
    scene["x-tool"] = 1;
    expect(() => validateScene(scene)).not.toThrow();
  });

  it("rejects a rotation outside 0, 90, 180, 270", () => {
    const scene = rawFixture("yard");
    scene.objects[0].rot = 45;
    expect(failure(scene).code).toBe("E_SCHEMA");
  });

  it("rejects a zone with fewer than 3 points and a lane with fewer than 2", () => {
    const zone = rawFixture("yard");
    zone.zones = [{ id: "z", points: [[0, 0], [1, 1]] }];
    expect(failure(zone).code).toBe("E_SCHEMA");
    const lane = rawFixture("yard");
    lane.lanes[0].points = [[0, 0]];
    expect(failure(lane).code).toBe("E_SCHEMA");
  });

  it("requires ids for order_along and a for other relations", () => {
    const scene = rawFixture("yard");
    scene.relations = [{ id: "r", rel: "order_along" }];
    expect(failure(scene).code).toBe("E_SCHEMA");
    scene.relations = [{ id: "r", rel: "order_along", ids: ["tree", "bench"] }];
    expect(() => validateScene(scene)).not.toThrow();
    scene.relations = [{ id: "r", rel: "left_of", b: "tree" }];
    expect(failure(scene).code).toBe("E_SCHEMA");
  });

  it("rejects a check name outside the catalog", () => {
    const scene = rawFixture("yard");
    scene.checks[0].check = "no_such_check";
    expect(failure(scene).code).toBe("E_SCHEMA");
  });

  it("requires the parameters of implemented checks", () => {
    const scene = rawFixture("yard");
    delete scene.checks[3].min;
    expect(failure(scene).code).toBe("E_SCHEMA");
  });

  it("rejects unknown parameters on implemented checks", () => {
    const scene = rawFixture("yard");
    scene.checks[3].minimum = 1;
    expect(failure(scene).code).toBe("E_SCHEMA");
  });

  it("rejects an empty ids list on a check", () => {
    const scene = rawFixture("yard");
    scene.checks[1].ids = [];
    expect(failure(scene).code).toBe("E_SCHEMA");
  });

  it("validates only id and check for checks the stage does not implement", () => {
    const scene = rawFixture("lane");
    scene.checks.push({ id: "later", check: "sort_consistency", anything: { goes: true } });
    expect(() => validateScene(scene)).not.toThrow();
  });

  it("rejects a degenerate camera", () => {
    const scene = rawFixture("yard");
    scene.camera.angleV = 30;
    expect(failure(scene).code).toBe("E_SCHEMA");
  });
});

describe("validate: references", () => {
  function refFailure(mutate: (scene: Record<string, any>) => void, pattern: RegExp): void {
    const scene = rawFixture("yard");
    mutate(scene);
    const err = failure(scene);
    expect(err.code).toBe("E_REF");
    expect(err.details.join("\n")).toMatch(pattern);
  }

  it("rejects duplicate object ids", () => {
    refFailure((s) => s.objects.push({ ...s.objects[0] }), /duplicate object id "tree"/);
  });

  it("rejects duplicate check ids", () => {
    refFailure((s) => { s.checks[1].id = "c1"; }, /duplicate check id "c1"/);
  });

  it("rejects an object with an unknown type", () => {
    refFailure((s) => { s.objects[0].type = "ghost"; }, /unknown type "ghost"/);
  });

  it("rejects a relation target that does not exist", () => {
    refFailure((s) => { s.relations[0].b = "ghost"; }, /relation "r1".*"ghost"/);
    refFailure((s) => { s.relations[0].b = "lane:ghost"; }, /"lane:ghost"/);
    refFailure((s) => { s.relations[0].b = "strip:floor.v2"; }, /"strip:floor.v2"/);
  });

  it("accepts zone, lane and strip edge targets", () => {
    const scene = rawFixture("yard");
    scene.relations[0].b = "lane:haul";
    scene.relations.push({ id: "r9", a: "bench", rel: "against", b: "strip:floor.v1" });
    expect(() => validateScene(scene)).not.toThrow();
  });

  it("rejects check parameters that name missing things", () => {
    refFailure((s) => { s.checks[0].region = "ghost"; }, /check "c1".*region "ghost"/);
    refFailure((s) => { s.checks[1].strip = "ghost"; }, /strip "ghost"/);
    refFailure((s) => { s.checks[1].ids = ["ghost"]; }, /object "ghost"/);
    refFailure((s) => { s.checks[3].a = "ghost"; }, /object "ghost"/);
    refFailure((s) => { s.checks[5].lane = "ghost"; }, /lane "ghost"/);
    refFailure((s) => { s.checks[7].target = "ghost"; }, /object "ghost"/);
  });

  it("does not resolve references of checks the stage does not implement", () => {
    const scene = rawFixture("lane");
    scene.checks.push({ id: "later", check: "state_stable", from: "nothing-here" });
    expect(() => validateScene(scene)).not.toThrow();
  });

  it("rejects a state that hides an unknown object", () => {
    refFailure((s) => { s.states.closed.hide = ["ghost"]; }, /state "closed".*"ghost"/);
  });

  it("rejects an assumption whose path does not resolve", () => {
    refFailure((s) => { s.assumptions[0].path = "/types/tree/size/7"; }, /assumption.*\/types\/tree\/size\/7/);
  });
});
