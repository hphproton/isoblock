import { expect } from "vitest";
import { footprint, rectCorners, rectsOverlap } from "../../src/core/geometry";
import { project } from "../../src/core/projection";
import type { Scene } from "../../src/core/types";

/** True when x is a multiple of 0.05 written with at most 6 decimals. */
export function onGrid(x: number): boolean {
  return Math.abs(x / 0.05 - Math.round(x / 0.05)) < 1e-9 && Math.round(x * 1e6) / 1e6 === x;
}

/** The constraints of SPEC section 8 on a proposal, checked from the two scenes. */
export function expectConstraints(before: Scene, after: Scene): void {
  const view = after.frame.regions.find((r) => !r.blocksScene);
  const [x0, y0, x1, y1] = view?.rect ?? [0, 0, 0, 0];
  const moved = after.objects.map((o, i) => o.pos[0] !== before.objects[i]?.pos[0] || o.pos[1] !== before.objects[i]?.pos[1]);
  after.objects.forEach((o, i) => {
    const prior = before.objects[i] as Scene["objects"][number];
    if (o.pos[0] !== prior.pos[0]) expect(onGrid(o.pos[0]), `${o.id} u ${o.pos[0]}`).toBe(true);
    if (o.pos[1] !== prior.pos[1]) expect(onGrid(o.pos[1]), `${o.id} v ${o.pos[1]}`).toBe(true);
    if (!moved[i]) return;
    for (const [u, v] of rectCorners(footprint(after, o))) {
      const [x, y] = project(after.camera, u, v, 0);
      expect(x >= x0 - 1e-9 && x <= x1 + 1e-9 && y >= y0 - 1e-9 && y <= y1 + 1e-9, `${o.id} corner in view`).toBe(true);
    }
    after.objects.forEach((other, j) => {
      if (j === i) return;
      const was = rectsOverlap(footprint(before, prior), footprint(before, before.objects[j] as Scene["objects"][number]));
      if (!was) expect(rectsOverlap(footprint(after, o), footprint(after, other)), `${o.id} overlaps ${other.id}`).toBe(false);
    });
  });
}
