import { round6 } from "../checks/result";
import type { Pos, Rot, Scene, SceneObject } from "../types";

function extent(size: readonly [number, number, number] | undefined, rot: number): readonly [number, number] {
  const [w, d] = size ?? [0, 0, 0];
  return rot === 90 || rot === 270 ? [d, w] : [w, d];
}

/** `pos` after `rot`, keeping the footprint center (the `rot` command of SPEC section 12). */
export function posForRotation(scene: Scene, object: SceneObject, rot: Rot): Pos {
  const current = object.rot ?? 0;
  const size = scene.types[object.type]?.size;
  const [w0, d0] = extent(size, current);
  const [w1, d1] = extent(size, rot);
  const u = round6(object.pos[0] + w0 / 2 - w1 / 2);
  const v = round6(object.pos[1] + d0 / 2 - d1 / 2);
  const h = (object.pos as readonly number[])[2];
  return h === undefined ? [u, v] : [u, v, h];
}
