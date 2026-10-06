import { EPS, type Box } from "./geometry";
import type { Vec3 } from "./types";

const PARALLEL = 1e-12;

/**
 * Length of the ray `origin + t * dir` (t > EPS) that runs strictly inside the box (slab test).
 * Touching a face, an edge or a corner gives 0.
 */
export function insideLength(origin: Vec3, dir: Vec3, box: Box): number {
  const lo: Vec3 = [box.u0, box.v0, box.h0];
  const hi: Vec3 = [box.u1, box.v1, box.h1];
  let tMin = EPS;
  let tMax = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i++) {
    const o = origin[i] as number;
    const d = dir[i] as number;
    if (Math.abs(d) < PARALLEL) {
      if (!(o > (lo[i] as number) && o < (hi[i] as number))) return 0;
      continue;
    }
    const t1 = ((lo[i] as number) - o) / d;
    const t2 = ((hi[i] as number) - o) / d;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }
  const length = (tMax - tMin) * Math.hypot(dir[0], dir[1], dir[2]);
  return length > EPS ? length : 0;
}
