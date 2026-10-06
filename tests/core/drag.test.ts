import { describe, expect, it } from "vitest";
import { dragTo, groundDelta, snapValue } from "../../src/core/drag";
import { planCamera } from "../../src/core/planView";
import { project } from "../../src/core/projection";
import type { Camera } from "../../src/core/types";
import { loadScene } from "../helpers/fixtures";

const iso: Camera = { angleU: 30, angleV: 150, pxPerUnit: 100, verticalScale: 1, origin: [10, 20] };
const crowd = loadScene("crowd");

describe("groundDelta", () => {
  it("maps a move along the screen axes of u and v to one unit", () => {
    const [ux, uy] = [100 * Math.cos(Math.PI / 6), 100 * Math.sin(Math.PI / 6)];
    const [vx, vy] = [-ux, uy];
    const du = groundDelta(iso, [0, 0], [ux, uy]);
    const dv = groundDelta(iso, [0, 0], [vx, vy]);
    expect(du[0]).toBeCloseTo(1, 9);
    expect(du[1]).toBeCloseTo(0, 9);
    expect(dv[0]).toBeCloseTo(0, 9);
    expect(dv[1]).toBeCloseTo(1, 9);
  });

  it("does not depend on the height of the plane that is dragged on", () => {
    const a = groundDelta(iso, [200, 120], [260, 90], 0);
    for (const h of [0.5, 2.4, -1]) {
      const b = groundDelta(iso, [200, 120], [260, 90], h);
      expect(b[0]).toBeCloseTo(a[0], 9);
      expect(b[1]).toBeCloseTo(a[1], 9);
    }
  });

  it("keeps the grabbed point under the pointer at any height", () => {
    const grab = project(iso, 2, 3, 1.5);
    const move = groundDelta(iso, grab, project(iso, 2.75, 3.5, 1.5), 1.5);
    expect(move[0]).toBeCloseTo(0.75, 9);
    expect(move[1]).toBeCloseTo(0.5, 9);
  });

  it("is a plain scale in the plan view", () => {
    const [du, dv] = groundDelta(planCamera(40), [0, 0], [40, 80]);
    expect(du).toBeCloseTo(1, 9);
    expect(dv).toBeCloseTo(2, 9);
  });
});

describe("snapValue", () => {
  it("rounds to the nearest multiple of the step", () => {
    expect(snapValue(1.26, 0.25)).toBe(1.25);
    expect(snapValue(1.13, 0.25)).toBe(1.25);
    expect(snapValue(-0.4, 0.25)).toBe(-0.5);
  });

  it("returns clean decimals, without floating point noise", () => {
    expect(snapValue(0.30000000000000004, 0.1)).toBe(0.3);
    expect(snapValue(0.7000000000001, 0.05)).toBe(0.7);
  });

  it("only removes floating point noise when the step is 0", () => {
    expect(snapValue(1.23456789, 0)).toBe(1.234568);
  });
});

describe("dragTo", () => {
  const plan = planCamera(40);
  const start = (id: string) => {
    const o = crowd.objects.find((x) => x.id === id)!;
    return { id, pos: o.pos, point: [0, 0] as const };
  };

  it("moves the object by the ground delta, snapped to the grid", () => {
    const { scene, blocked } = dragTo(crowd, plan, start("o101"), [41, 79], 0.25);
    const base = crowd.objects.find((o) => o.id === "o101")!.pos;
    expect(blocked).toEqual([]);
    expect(scene.objects.find((o) => o.id === "o101")!.pos).toEqual([snapValue(base[0] + 1.025, 0.25), snapValue(base[1] + 1.975, 0.25)]);
  });

  it("always starts from the scene it is given, so the result does not drift", () => {
    const first = dragTo(crowd, plan, start("o101"), [100, 100], 0.1).scene;
    const again = dragTo(crowd, plan, start("o101"), [100, 100], 0.1).scene;
    expect(first.objects).toEqual(again.objects);
    expect(dragTo(crowd, plan, start("o101"), [0, 0], 0.1).scene.objects.find((o) => o.id === "o101")!.pos).toEqual(
      crowd.objects.find((o) => o.id === "o101")!.pos,
    );
  });

  it("does not move an object whose pos is locked", () => {
    const result = dragTo(crowd, plan, start("o010"), [200, 200], 0.1);
    expect(result.scene).toBe(crowd);
    expect(result.blocked).toEqual(["pos"]);
  });

  it("moves along v only when pos.u is locked, and along u only when pos.v is locked", () => {
    const u = dragTo(crowd, plan, start("o020"), [80, 80], 0.5);
    const base20 = crowd.objects.find((o) => o.id === "o020")!.pos;
    const moved20 = u.scene.objects.find((o) => o.id === "o020")!.pos;
    expect(moved20[0]).toBe(base20[0]);
    expect(moved20[1]).not.toBe(base20[1]);
    const v = dragTo(crowd, plan, start("o030"), [80, 80], 0.5);
    const base30 = crowd.objects.find((o) => o.id === "o030")!.pos;
    const moved30 = v.scene.objects.find((o) => o.id === "o030")!.pos;
    expect(moved30[1]).toBe(base30[1]);
    expect(moved30[0]).not.toBe(base30[0]);
  });

  it("works in the isometric view with the scene camera", () => {
    const grab = project(crowd.camera, 5.25, 5.25, 0);
    const to = project(crowd.camera, 7.25, 4.25, 0);
    const o = crowd.objects.find((x) => x.id === "o101")!;
    const result = dragTo(crowd, crowd.camera, { id: "o101", pos: o.pos, point: grab }, to, 0.25);
    const pos = result.scene.objects.find((x) => x.id === "o101")!.pos;
    expect(pos[0]).toBeCloseTo(snapValue(o.pos[0] + 2, 0.25), 9);
    expect(pos[1]).toBeCloseTo(snapValue(o.pos[1] - 1, 0.25), 9);
  });
});
