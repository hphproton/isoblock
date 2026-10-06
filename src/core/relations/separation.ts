import type { Rect } from "../geometry";
import { cameraDirection } from "../projection";
import type { Scene } from "../types";
import { band, bandMessage, linearRange, type Band, type Measure, type Rects } from "./shared";

export type SeparationRel = "left_of" | "right_of" | "in_front_of" | "behind";

const DEG = Math.PI / 180;

/**
 * `left_of`, `right_of`: screen-x separation of the two footprints, with screen x on the ground
 * `s(u, v) = u cos(angleU) + v cos(angleV)`. `in_front_of`, `behind`: ground-depth separation,
 * with `d(u, v) = (cu u + cv v) / hypot(cu, cv)` for the camera direction c (SPEC section 7).
 */
export function separationMeasure(scene: Scene, rel: SeparationRel, a: number, b: number, gap: Band): Measure {
  const screen = rel === "left_of" || rel === "right_of";
  const [cu, cv] = cameraDirection(scene.camera);
  const length = Math.hypot(cu, cv);
  const ku = screen ? Math.cos(scene.camera.angleU * DEG) : cu / length;
  const kv = screen ? Math.cos(scene.camera.angleV * DEG) : cv / length;
  // left_of and behind: min of b minus max of a; right_of and in_front_of: min of a minus max of b.
  const bFirst = rel === "left_of" || rel === "behind";
  const separation = (rects: Rects): number => {
    const ra = linearRange(rects[a] as Rect, ku, kv);
    const rb = linearRange(rects[b] as Rect, ku, kv);
    return bFirst ? rb[0] - ra[1] : ra[0] - rb[1];
  };
  const quantity = screen ? "screen-x separation" : "depth separation";
  return {
    violation: (rects) => band(separation(rects), gap),
    message: (rects) => bandMessage(quantity, separation(rects), gap),
  };
}
