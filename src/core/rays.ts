import { EPS, type Box } from "./geometry";
import type { Vec3 } from "./types";

const PARALLEL = 1e-12;

interface Slab {
  readonly t0: number;
  readonly t1: number;
}

/** The parameter interval of the ray that runs strictly inside the box, or null when it does not. */
function slab(origin: Vec3, dir: Vec3, box: Box): Slab | null {
  const lo: Vec3 = [box.u0, box.v0, box.h0];
  const hi: Vec3 = [box.u1, box.v1, box.h1];
  let tMin = EPS;
  let tMax = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i++) {
    const o = origin[i] as number;
    const d = dir[i] as number;
    if (Math.abs(d) < PARALLEL) {
      if (!(o > (lo[i] as number) && o < (hi[i] as number))) return null;
      continue;
    }
    const t1 = ((lo[i] as number) - o) / d;
    const t2 = ((hi[i] as number) - o) / d;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }
  return { t0: tMin, t1: tMax };
}

function spanLength(dir: Vec3, span: Slab): number {
  return (span.t1 - span.t0) * Math.hypot(dir[0], dir[1], dir[2]);
}

/**
 * Length of the ray `origin + t * dir` (t > EPS) that runs strictly inside the box (slab test).
 * Touching a face, an edge or a corner gives 0.
 */
export function insideLength(origin: Vec3, dir: Vec3, box: Box): number {
  const span = slab(origin, dir, box);
  if (span === null) return 0;
  const length = spanLength(dir, span);
  return length > EPS ? length : 0;
}

/**
 * The point where the ray leaves `box`, when the ray runs strictly inside it for a length above EPS.
 * Null otherwise. `dir` is the same unnormalized direction `insideLength` uses.
 */
export function leavePoint(origin: Vec3, dir: Vec3, box: Box): Vec3 | null {
  const span = slab(origin, dir, box);
  if (span === null || !(spanLength(dir, span) > EPS)) return null;
  return [origin[0] + span.t1 * dir[0], origin[1] + span.t1 * dir[1], origin[2] + span.t1 * dir[2]];
}
