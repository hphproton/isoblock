import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cameraDirection, depth, inverse, project } from "../../src/core/projection";
import type { Camera } from "../../src/core/types";
import { goldenDir } from "../helpers/fixtures";

interface Golden {
  camera: Camera;
  cases: { uvh: [number, number, number]; xy: [number, number] }[];
  cameraDir: [number, number, number];
  dimetric21: {
    camera: Camera;
    cases: { uvh: [number, number, number]; xy: [number, number] }[];
    cameraDir: [number, number, number];
  };
  inverse: { xyh: [number, number, number]; uv: [number, number] }[];
}

const golden = JSON.parse(readFileSync(join(goldenDir, "projection.json"), "utf8")) as Golden;
const PX = 6e-4; // golden values are rounded to 3 decimals
const UV = 6e-5; // inverse values are rounded to 4 decimals

describe("projection: golden vectors", () => {
  for (const c of golden.cases) {
    it(`projects (${c.uvh.join(", ")})`, () => {
      const [x, y] = project(golden.camera, ...c.uvh);
      expect(Math.abs(x - c.xy[0])).toBeLessThan(PX);
      expect(Math.abs(y - c.xy[1])).toBeLessThan(PX);
    });
  }

  for (const c of golden.dimetric21.cases) {
    it(`projects (${c.uvh.join(", ")}) with the 2:1 camera`, () => {
      const [x, y] = project(golden.dimetric21.camera, ...c.uvh);
      expect(Math.abs(x - c.xy[0])).toBeLessThan(PX);
      expect(Math.abs(y - c.xy[1])).toBeLessThan(PX);
    });
  }

  for (const c of golden.inverse) {
    it(`inverts (${c.xyh.join(", ")})`, () => {
      const [x, y, h] = c.xyh;
      const [u, v] = inverse(golden.camera, x, y, h);
      expect(Math.abs(u - c.uv[0])).toBeLessThan(UV);
      expect(Math.abs(v - c.uv[1])).toBeLessThan(UV);
    });
  }

  it("computes the camera direction", () => {
    const c = cameraDirection(golden.camera);
    golden.cameraDir.forEach((e, i) => expect(Math.abs((c[i] as number) - e)).toBeLessThan(1e-6));
  });

  it("computes the camera direction of the 2:1 camera", () => {
    const c = cameraDirection(golden.dimetric21.camera);
    golden.dimetric21.cameraDir.forEach((e, i) => expect(Math.abs((c[i] as number) - e)).toBeLessThan(1e-6));
  });
});

describe("projection: properties", () => {
  const camera: Camera = { angleU: 30, angleV: 150, pxPerUnit: 80, verticalScale: 1, origin: [300, 300] };

  it("round-trips ground points at any height", () => {
    for (const [u, v, h] of [[0, 0, 0], [3.2, -1.7, 0.5], [12, 9, 2.25]] as const) {
      const [x, y] = project(camera, u, v, h);
      const [u2, v2] = inverse(camera, x, y, h);
      expect(u2).toBeCloseTo(u, 9);
      expect(v2).toBeCloseTo(v, 9);
    }
  });

  it("maps points along the camera direction to one screen point", () => {
    const c = cameraDirection(camera);
    const a = project(camera, 2, 1, 0.5);
    const b = project(camera, 2 + 1.7 * c[0], 1 + 1.7 * c[1], 0.5 + 1.7 * c[2]);
    expect(b[0]).toBeCloseTo(a[0], 9);
    expect(b[1]).toBeCloseTo(a[1], 9);
  });

  it("defaults verticalScale to 1 and applies it to the height axis", () => {
    const { verticalScale: _omit, ...bare } = camera;
    expect(project(bare, 0, 0, 1)).toEqual(project(camera, 0, 0, 1));
    expect(project({ ...camera, verticalScale: 0.5 }, 0, 0, 2)[1]).toBeCloseTo(300 - 80, 9);
  });

  it("measures depth along the camera direction", () => {
    expect(depth([1, 1, 1], 2, 3, 4)).toBe(9);
  });
});
