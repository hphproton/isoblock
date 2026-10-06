import type { Rect } from "../geometry";
import { fmt } from "../format";
import { centerAlong, SATISFIED, type Measure, type Rects } from "./shared";

export type Axis = "u" | "v";

/** The axis parameter: `u` or `v`; `fallback` when absent; `null` when it is something else. */
export function axisOf(value: string | undefined, fallback: Axis | null): Axis | null {
  if (value === undefined) return fallback;
  return value === "u" || value === "v" ? value : null;
}

/** `aligned`: the difference of the footprint centers along the axis. */
export function alignedMeasure(a: number, b: number, axis: Axis): Measure {
  const difference = (rects: Rects) => Math.abs(centerAlong(rects[a] as Rect, axis) - centerAlong(rects[b] as Rect, axis));
  return {
    violation: difference,
    message: (rects) => `center difference along ${axis} ${fmt(difference(rects))}, wanted 0`,
  };
}

/** `order_along`: sum over consecutive objects of `max(0, center_i - center_(i+1))` along the axis. */
export function orderAlongMeasure(objects: readonly number[], axis: Axis): Measure {
  const backward = (rects: Rects) => {
    let sum = 0;
    for (let i = 1; i < objects.length; i++) {
      const before = centerAlong(rects[objects[i - 1] as number] as Rect, axis);
      const after = centerAlong(rects[objects[i] as number] as Rect, axis);
      sum += Math.max(0, before - after);
    }
    return sum;
  };
  return {
    violation: backward,
    message: (rects) => {
      const v = backward(rects);
      return v > SATISFIED ? `out of order along ${axis} by ${fmt(v)}` : `in order along ${axis}`;
    },
  };
}
