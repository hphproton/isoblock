import { worldParts } from "../geometry";
import { projector } from "../projection";
import type { Scene, SceneObject } from "../types";

export interface ScreenBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Screen bounds of the 8 corners of every part, as `min_screen_size` measures them (SPEC 9.2). */
export function partScreenBox(scene: Scene, object: SceneObject): ScreenBox {
  const at = projector(scene.camera);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { box } of worldParts(scene, object)) {
    for (const u of [box.u0, box.u1]) {
      for (const v of [box.v0, box.v1]) {
        for (const h of [box.h0, box.h1]) {
          const [x, y] = at(u, v, h);
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
  }
  return { x0, y0, x1, y1 };
}

/** `max h1 - min h0` over the object's parts: the length of a vertical edge from the lowest to the highest. */
export function partHeightSpan(scene: Scene, object: SceneObject): number {
  let h0 = Infinity;
  let h1 = -Infinity;
  for (const { box } of worldParts(scene, object)) {
    if (box.h0 < h0) h0 = box.h0;
    if (box.h1 > h1) h1 = box.h1;
  }
  return h1 - h0;
}
