import { describe, expect, it } from "vitest";
import type { Box } from "../../src/core/geometry";
import { boxInfo, drawOrder, orderInfos, pairOrder, type BoxInfo } from "../../src/core/drawOrder";
import { worldParts } from "../../src/core/geometry";
import { cameraDirection } from "../../src/core/projection";
import type { Camera } from "../../src/core/types";
import { loadScene } from "../helpers/fixtures";

const iso: Camera = { angleU: 30, angleV: 150, pxPerUnit: 100, verticalScale: 1, origin: [0, 0] };
const b = (u0: number, v0: number, h0: number, u1: number, v1: number, h1: number): Box => ({ u0, v0, h0, u1, v1, h1 });

describe("drawOrder", () => {
  it("draws a box that is lower in u before the one in front of it", () => {
    expect(drawOrder([b(2, 0, 0, 3, 1, 1), b(0, 0, 0, 1, 1, 1)], iso)).toEqual([1, 0]);
  });

  it("draws a box that is lower in v before the one in front of it", () => {
    expect(drawOrder([b(0, 2, 0, 1, 3, 1), b(0, 0, 0, 1, 1, 1)], iso)).toEqual([1, 0]);
  });

  it("draws a lower box before the one stacked on it", () => {
    expect(drawOrder([b(0, 0, 1, 1, 1, 2), b(0, 0, 0, 1, 1, 1)], iso)).toEqual([1, 0]);
  });

  it("keeps a box that hovers above and behind in front of a lower one it overlaps on screen", () => {
    const canopy = b(-0.2, -0.2, 1.4, 1.4, 1.4, 2.4);
    const actorBehind = b(-1, 0.2, 0, -0.6, 0.6, 1.2);
    expect(drawOrder([canopy, actorBehind], iso)).toEqual([1, 0]);
  });

  it("does not order boxes that cannot occlude each other", () => {
    const left = b(0, 5, 0, 1, 6, 1);
    const right = b(5, 0, 0, 6, 1, 1);
    expect(drawOrder([left, right], iso)).toHaveLength(2);
  });

  it("falls back to depth for boxes that interpenetrate", () => {
    expect(drawOrder([b(0.4, 0.4, 0, 2, 2, 1), b(0, 0, 0, 1, 1, 1)], iso)).toEqual([1, 0]);
  });

  it("is deterministic and always returns a permutation, even for interlocked boxes", () => {
    const ring = [b(0, 0, 1, 1, 3, 2), b(1, 0, 0, 2, 1, 3), b(0, 2, 0, 3, 3, 1), b(0.5, 0.5, 0.5, 2.5, 2.5, 1.5)];
    const order = drawOrder(ring, iso);
    expect([...order].sort()).toEqual([0, 1, 2, 3]);
    expect(drawOrder(ring, iso)).toEqual(order);
  });

  it("returns an empty list for no boxes", () => {
    expect(drawOrder([], iso)).toEqual([]);
  });
});

/** The straightforward algorithm: every pair is compared, the next box is found by scanning. */
function referenceOrder(infos: readonly BoxInfo[], c: readonly [number, number, number]): number[] {
  const after: number[][] = infos.map(() => []);
  const waiting = infos.map(() => 0);
  for (let i = 0; i < infos.length; i++) {
    for (let j = i + 1; j < infos.length; j++) {
      const rel = pairOrder(infos[i]!, infos[j]!, c);
      if (rel === 0) continue;
      const [first, second] = rel < 0 ? [i, j] : [j, i];
      after[first]!.push(second);
      waiting[second]! += 1;
    }
  }
  const placed = new Set<number>();
  const result: number[] = [];
  while (result.length < infos.length) {
    const pending = infos.map((_, i) => i).filter((i) => !placed.has(i));
    const ready = pending.filter((i) => waiting[i] === 0);
    const candidates = ready.length > 0 ? ready : pending;
    const next = candidates.reduce((best, i) => (infos[i]!.depth < infos[best]!.depth ? i : best), candidates[0]!);
    placed.add(next);
    result.push(next);
    for (const j of after[next]!) waiting[j]! -= 1;
  }
  return result;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("drawOrder: fast path equals the straightforward algorithm", () => {
  const cameras: Camera[] = [
    iso,
    { angleU: 26.565, angleV: 153.435, pxPerUnit: 40, verticalScale: 1.2, origin: [100, 50] },
    { angleU: 0, angleV: 90, pxPerUnit: 20, verticalScale: 0, origin: [0, 0] },
  ];

  for (const [k, camera] of cameras.entries()) {
    it(`gives the same order for 120 random boxes, camera ${k}`, () => {
      const random = lcg(11 + k);
      const boxes = Array.from({ length: 120 }, () => {
        const u0 = Math.round(random() * 60) / 4;
        const v0 = Math.round(random() * 30) / 4;
        const h0 = random() < 0.3 ? Math.round(random() * 8) / 4 : 0;
        return b(u0, v0, h0, u0 + 0.25 + random() * 1.5, v0 + 0.25 + random() * 1.5, h0 + 0.25 + random() * 2);
      });
      const c = cameraDirection(camera);
      const infos = boxes.map((box) => boxInfo(box, camera, c));
      expect(orderInfos(infos, c)).toEqual(referenceOrder(infos, c));
      expect(drawOrder(boxes, camera)).toEqual(referenceOrder(infos, c));
    });
  }

  it("gives the same order for the parts of the crowd fixture", () => {
    const crowd = loadScene("crowd");
    const boxes = crowd.objects.flatMap((o) => worldParts(crowd, o).map((p) => p.box));
    const c = cameraDirection(crowd.camera);
    const infos = boxes.map((box) => boxInfo(box, crowd.camera, c));
    expect(drawOrder(boxes, crowd.camera)).toEqual(referenceOrder(infos, c));
  });

  it("gives the same order for interlocked boxes that form a cycle", () => {
    const ring = [b(0, 0, 1, 1, 3, 2), b(1, 0, 0, 2, 1, 3), b(0, 2, 0, 3, 3, 1), b(0.5, 0.5, 0.5, 2.5, 2.5, 1.5)];
    const c = cameraDirection(iso);
    expect(drawOrder(ring, iso)).toEqual(referenceOrder(ring.map((box) => boxInfo(box, iso, c)), c));
  });
});
