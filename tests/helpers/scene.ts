import type { Scene } from "../../src/core/types";

/** A small valid scene for synthetic tests; override any top-level key. */
export function makeScene(overrides: Record<string, unknown> = {}): Scene {
  return {
    schema: "isoblock/1",
    id: "synthetic",
    units: { name: "u" },
    camera: { angleU: 30, angleV: 150, pxPerUnit: 100, verticalScale: 1, origin: [540, 250] },
    frame: {
      w: 1000,
      h: 1000,
      regions: [
        { id: "hud", rect: [0, 0, 1000, 150], blocksScene: true },
        { id: "view", rect: [0, 150, 1000, 1000] },
      ],
    },
    types: { box: { size: [1, 1, 1] } },
    objects: [],
    ...overrides,
  } as Scene;
}

/**
 * Scene with an axis-aligned camera: screen = (10u, 10v), so footprint corners map to
 * round pixel values. The camera direction is c = (0, 1, 1).
 */
export function flatScene(overrides: Record<string, unknown> = {}): Scene {
  return makeScene({
    camera: { angleU: 0, angleV: 90, pxPerUnit: 10, verticalScale: 1, origin: [0, 0] },
    frame: { w: 100, h: 100, regions: [{ id: "view", rect: [0, 0, 100, 100] }] },
    ...overrides,
  });
}

export function box(id: string, pos: [number, number], type = "box", rot = 0): Record<string, unknown> {
  return { id, type, pos, rot };
}
