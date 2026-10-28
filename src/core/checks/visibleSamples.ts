import { EPS, type Box } from "../geometry";
import type { Vec3 } from "../types";

const GRID = 8;
const OFFSET = 1e-6;

const cells = (lo: number, hi: number): number[] =>
  Array.from({ length: GRID }, (_, i) => lo + ((i + 0.5) / GRID) * (hi - lo));

/** One sample of a camera-facing face: the face point, and the same point offset outward by 1e-6. */
export interface VisibleSample {
  readonly at: Vec3;
  readonly origin: Vec3;
}

/**
 * Samples of the faces of `box` that face the camera (SPEC 9.1): the top face, and each side
 * whose normal points toward the camera, from `from` of the height up. 64 points per face.
 */
export function visibleSamples(box: Box, c: Vec3, from: number): readonly VisibleSample[] {
  const hFrom = box.h0 + from * (box.h1 - box.h0);
  const out: VisibleSample[] = [];
  const sideH = cells(hFrom, box.h1);
  if (c[0] > EPS || c[0] < -EPS) {
    const face = c[0] > 0 ? box.u1 : box.u0;
    const originU = c[0] > 0 ? box.u1 + OFFSET : box.u0 - OFFSET;
    for (const v of cells(box.v0, box.v1)) {
      for (const h of sideH) out.push({ at: [face, v, h], origin: [originU, v, h] });
    }
  }
  if (c[1] > EPS || c[1] < -EPS) {
    const face = c[1] > 0 ? box.v1 : box.v0;
    const originV = c[1] > 0 ? box.v1 + OFFSET : box.v0 - OFFSET;
    for (const u of cells(box.u0, box.u1)) {
      for (const h of sideH) out.push({ at: [u, face, h], origin: [u, originV, h] });
    }
  }
  for (const u of cells(box.u0, box.u1)) {
    for (const v of cells(box.v0, box.v1)) out.push({ at: [u, v, box.h1], origin: [u, v, box.h1 + OFFSET] });
  }
  return out;
}
