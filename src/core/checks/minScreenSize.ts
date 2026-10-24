import { EPS, indexObjects } from "../geometry";
import { screenAxes } from "../projection";
import type { CheckResult, MinScreenSizeCheck, Scene } from "../types";
import { round6 } from "./result";
import { partHeightSpan, partScreenBox } from "./screenBounds";

/**
 * The target is at least `min` pixels tall on screen (SPEC 9.2, 9.4).
 * `bounds` is the height of the screen box of every part. `height` is only the vertical extent.
 */
export function checkMinScreenSize(scene: Scene, spec: MinScreenSizeCheck): CheckResult {
  const target = indexObjects(scene).get(spec.target)!;
  const scale = (spec.screenWidth ?? scene.frame.w) / scene.frame.w;
  const pixels =
    spec.measure === "height"
      ? partHeightSpan(scene, target) * Math.abs(screenAxes(scene.camera).up[1])
      : partScreenBox(scene, target).y1 - partScreenBox(scene, target).y0;
  const value = round6(pixels * scale);
  const height = spec.measure === "height";
  return {
    id: spec.id,
    check: spec.check,
    status: value >= spec.min - EPS ? "pass" : "fail",
    value,
    threshold: spec.min,
    ids: [target.id],
    message: height
      ? `${spec.target} is ${value} px tall by height (min ${spec.min})`
      : `${spec.target} is ${value.toFixed(0)} px tall (min ${spec.min})`,
  };
}
