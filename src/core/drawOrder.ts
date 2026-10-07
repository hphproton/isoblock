import { EPS, type Box } from "./geometry";
import { depth, orderDirection, projector } from "./projection";
import { round } from "./round";
import type { Camera, Vec3 } from "./types";

/** A box with the numbers the ordering needs: depth toward the camera and its screen bounds. */
export interface BoxInfo {
  readonly box: Box;
  /** `c` dot the box center, rounded to 6 decimals (SPEC 13.4). */
  readonly depth: number;
  /** Screen bounds: min x, min y, max x, max y. */
  readonly screen: readonly [number, number, number, number];
}

export function boxInfo(box: Box, camera: Camera, c: Vec3): BoxInfo {
  const at = projector(camera);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const u of [box.u0, box.u1]) {
    for (const v of [box.v0, box.v1]) {
      for (const h of [box.h0, box.h1]) {
        const [x, y] = at(u, v, h);
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  const centre = depth(c, (box.u0 + box.u1) / 2, (box.v0 + box.v1) / 2, (box.h0 + box.h1) / 2);
  return { box, depth: round(centre, 6), screen: [x0, y0, x1, y1] };
}

function screensOverlap(a: BoxInfo, b: BoxInfo): boolean {
  return a.screen[0] < b.screen[2] - EPS && b.screen[0] < a.screen[2] - EPS &&
    a.screen[1] < b.screen[3] - EPS && b.screen[1] < a.screen[3] - EPS;
}

/**
 * -1 when `a` must be drawn before `b`, 1 when after, 0 when no order is needed.
 * A box separated from another along an axis cannot occlude it from the side it lies on.
 */
export function pairOrder(a: BoxInfo, b: BoxInfo, c: Vec3): -1 | 0 | 1 {
  if (!screensOverlap(a, b)) return 0;
  const ab = a.box;
  const bb = b.box;
  // Each axis along which the boxes are apart votes for the box that is farther from the camera to go first.
  let before = false;
  let after = false;
  for (let axis = 0; axis < 3; axis++) {
    const alo = axis === 0 ? ab.u0 : axis === 1 ? ab.v0 : ab.h0;
    const ahi = axis === 0 ? ab.u1 : axis === 1 ? ab.v1 : ab.h1;
    const blo = axis === 0 ? bb.u0 : axis === 1 ? bb.v0 : bb.h0;
    const bhi = axis === 0 ? bb.u1 : axis === 1 ? bb.v1 : bb.h1;
    const aBelow = ahi <= blo + EPS;
    const bBelow = bhi <= alo + EPS;
    if (!aBelow && !bBelow) continue;
    const dir = c[axis] as number;
    if (Math.abs(dir) <= EPS) return 0;
    if (aBelow === dir > 0) before = true;
    else after = true;
  }
  if (before && after) return 0;
  if (before) return -1;
  if (after) return 1;
  return a.depth === b.depth ? 0 : a.depth < b.depth ? -1 : 1;
}

/** Binary min-heap of box indices, ordered by depth, then by index. */
class ReadyQueue {
  private readonly items: number[] = [];

  constructor(private readonly depths: readonly number[]) {}

  private before(a: number, b: number): boolean {
    const da = this.depths[a] as number;
    const db = this.depths[b] as number;
    return da < db || (da === db && a < b);
  }

  push(index: number): void {
    const items = this.items;
    let at = items.length;
    items.push(index);
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (!this.before(index, items[parent] as number)) break;
      items[at] = items[parent] as number;
      at = parent;
    }
    items[at] = index;
  }

  pop(): number | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (top === undefined || last === undefined || items.length === 0) return top;
    let at = 0;
    for (;;) {
      let child = 2 * at + 1;
      if (child >= items.length) break;
      if (child + 1 < items.length && this.before(items[child + 1] as number, items[child] as number)) child += 1;
      if (!this.before(items[child] as number, last)) break;
      items[at] = items[child] as number;
      at = child;
    }
    items[at] = last;
    return top;
  }
}

/**
 * Painter's order for boxes with known bounds: indices from back to front. Boxes are ordered by
 * pairwise occlusion; ties and cycles are broken by depth, then by index.
 * Only boxes whose screen bounds overlap along x are compared (sweep and prune).
 */
export function orderInfos(info: readonly BoxInfo[], c: Vec3): number[] {
  const n = info.length;
  const after: number[][] = info.map(() => []);
  const waiting = info.map(() => 0);
  // Array.prototype.sort is stable, so boxes that start at the same x keep their index order.
  const left = info.map((x) => x.screen[0]);
  const byX = info.map((_, i) => i).sort((p, q) => (left[p] as number) - (left[q] as number));
  for (let s = 0; s < n; s++) {
    const a = byX[s] as number;
    const reach = (info[a] as BoxInfo).screen[2] - EPS;
    for (let t = s + 1; t < n; t++) {
      const b = byX[t] as number;
      if ((info[b] as BoxInfo).screen[0] >= reach) break;
      const [i, j] = a < b ? [a, b] : [b, a];
      const rel = pairOrder(info[i] as BoxInfo, info[j] as BoxInfo, c);
      if (rel === 0) continue;
      const [first, second] = rel < 0 ? [i, j] : [j, i];
      (after[first] as number[]).push(second);
      waiting[second] = (waiting[second] as number) + 1;
    }
  }
  const depths = info.map((x) => x.depth);
  const ready = new ReadyQueue(depths);
  waiting.forEach((w, i) => w === 0 && ready.push(i));
  const placed = new Array<boolean>(n).fill(false);
  const result: number[] = [];
  let cursor = 0;
  const release = (index: number): void => {
    placed[index] = true;
    result.push(index);
    for (const j of after[index] as number[]) {
      waiting[j] = (waiting[j] as number) - 1;
      if (waiting[j] === 0 && !placed[j]) ready.push(j);
    }
  };
  while (result.length < n) {
    let next = ready.pop();
    while (next !== undefined && placed[next]) next = ready.pop();
    if (next === undefined) {
      // A cycle: take the unplaced box with the smallest depth.
      let best = -1;
      for (let i = cursor; i < n; i++) {
        if (placed[i]) continue;
        if (best < 0 || (depths[i] as number) < (depths[best] as number)) best = i;
      }
      next = best;
    }
    release(next);
    while (cursor < n && placed[cursor]) cursor += 1;
  }
  return result;
}

/** Painter's order for axis-aligned boxes (SPEC 13.4): indices from back to front. */
export function drawOrder(boxes: readonly Box[], camera: Camera): number[] {
  const c = orderDirection(camera);
  return orderInfos(boxes.map((b) => boxInfo(b, camera, c)), c);
}
