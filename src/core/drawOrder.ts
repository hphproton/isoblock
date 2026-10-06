import { EPS, type Box } from "./geometry";
import { cameraDirection, depth, project } from "./projection";
import type { Camera, Vec3 } from "./types";

interface Info {
  readonly box: Box;
  readonly depth: number;
  readonly screen: readonly [number, number, number, number];
}

function infoOf(box: Box, camera: Camera, c: Vec3): Info {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const u of [box.u0, box.u1]) {
    for (const v of [box.v0, box.v1]) {
      for (const h of [box.h0, box.h1]) {
        const [x, y] = project(camera, u, v, h);
        xs.push(x);
        ys.push(y);
      }
    }
  }
  const centre = depth(c, (box.u0 + box.u1) / 2, (box.v0 + box.v1) / 2, (box.h0 + box.h1) / 2);
  return { box, depth: centre, screen: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
}

function screensOverlap(a: Info, b: Info): boolean {
  return a.screen[0] < b.screen[2] - EPS && b.screen[0] < a.screen[2] - EPS &&
    a.screen[1] < b.screen[3] - EPS && b.screen[1] < a.screen[3] - EPS;
}

/**
 * -1 when `a` must be drawn before `b`, 1 when after, 0 when no order is needed.
 * A box separated from another along an axis cannot occlude it from the side it lies on.
 */
function order(a: Info, b: Info, c: Vec3): -1 | 0 | 1 {
  if (!screensOverlap(a, b)) return 0;
  const ranges: readonly (readonly [number, number, number, number, number])[] = [
    [a.box.u0, a.box.u1, b.box.u0, b.box.u1, c[0]],
    [a.box.v0, a.box.v1, b.box.v0, b.box.v1, c[1]],
    [a.box.h0, a.box.h1, b.box.h0, b.box.h1, c[2]],
  ];
  const votes = new Set<-1 | 1>();
  for (const [alo, ahi, blo, bhi, dir] of ranges) {
    const aBelow = ahi <= blo + EPS;
    const bBelow = bhi <= alo + EPS;
    if (!aBelow && !bBelow) continue;
    if (Math.abs(dir) <= EPS) return 0;
    votes.add(aBelow === dir > 0 ? -1 : 1);
  }
  if (votes.size === 2) return 0;
  const [vote] = votes;
  if (vote !== undefined) return vote;
  return a.depth === b.depth ? 0 : a.depth < b.depth ? -1 : 1;
}

/**
 * Painter's order for axis-aligned boxes: indices from back to front.
 * Boxes are ordered by pairwise occlusion; ties and cycles are broken by depth, then by index.
 */
export function drawOrder(boxes: readonly Box[], camera: Camera): number[] {
  const c = cameraDirection(camera);
  const info = boxes.map((b) => infoOf(b, camera, c));
  const after: number[][] = info.map(() => []);
  const waiting = info.map(() => 0);
  for (let i = 0; i < info.length; i++) {
    for (let j = i + 1; j < info.length; j++) {
      const rel = order(info[i] as Info, info[j] as Info, c);
      if (rel === 0) continue;
      const [first, second] = rel < 0 ? [i, j] : [j, i];
      (after[first] as number[]).push(second);
      waiting[second] = (waiting[second] as number) + 1;
    }
  }
  const placed = new Set<number>();
  const result: number[] = [];
  const pick = (candidates: number[]): number =>
    candidates.reduce((best, i) =>
      (info[i] as Info).depth < (info[best] as Info).depth ? i : best, candidates[0] as number);
  while (result.length < info.length) {
    const pending = info.map((_, i) => i).filter((i) => !placed.has(i));
    const ready = pending.filter((i) => waiting[i] === 0);
    const next = pick(ready.length > 0 ? ready : pending);
    placed.add(next);
    result.push(next);
    for (const j of after[next] as number[]) waiting[j] = (waiting[j] as number) - 1;
  }
  return result;
}
