import { EPS, indexObjects, worldParts } from "../geometry";
import { projector } from "../projection";
import type { CheckResult, MinScreenSizeCheck, Scene } from "../types";
import { round6 } from "./result";

/**
 * The target is at least `min` pixels tall on screen (SPEC section 9.2): the height of the screen
 * bounds of the 8 corners of every part, scaled from the frame width to `screenWidth`.
 */
export function checkMinScreenSize(scene: Scene, spec: MinScreenSizeCheck): CheckResult {
  const target = indexObjects(scene).get(spec.target)!;
  const at = projector(scene.camera);
  let top = Infinity;
  let bottom = -Infinity;
  for (const { box } of worldParts(scene, target)) {
    for (const u of [box.u0, box.u1]) {
      for (const v of [box.v0, box.v1]) {
        for (const h of [box.h0, box.h1]) {
          const y = at(u, v, h)[1];
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }
  }
  const value = round6((bottom - top) * ((spec.screenWidth ?? scene.frame.w) / scene.frame.w));
  return {
    id: spec.id,
    check: spec.check,
    status: value >= spec.min - EPS ? "pass" : "fail",
    value,
    threshold: spec.min,
    ids: [target.id],
    message: `${spec.target} is ${value.toFixed(0)} px tall (min ${spec.min})`,
  };
}
