import { round6 } from "./checks/result";
import { footprint } from "./geometry";
import { inverse } from "./projection";
import type { Scene, Vec2 } from "./types";

const DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Nearest multiple of `step`, with a tie rounded toward +infinity, then to 6 decimals. */
export function snapHalfUp(value: number, step: number): number {
  if (!(step > 0)) return round6(value);
  return round6(Math.floor(value / step + 0.5) * step);
}

/** A decimal token a short command accepts. A value JSON would write with an exponent is rounded. */
export function decimal(n: number): string {
  const text = JSON.stringify(n);
  if (DECIMAL.test(text)) return text;
  const fallback = round6(n).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return fallback === "-0" ? "0" : fallback;
}

/** `<type><n>` with the smallest integer n >= 1 that no object uses. */
export function freshId(scene: Scene, type: string): string {
  const used = new Set(scene.objects.map((object) => object.id));
  let n = 1;
  while (used.has(`${type}${n}`)) n += 1;
  return `${type}${n}`;
}

/**
 * Ground point under the center of the view region (the first frame region without
 * `blocksScene`), each coordinate snapped. Without such a region, the frame center is used.
 */
export function addPosition(scene: Scene, step: number): Vec2 {
  const region = scene.frame.regions.find((item) => item.blocksScene !== true);
  const rect = region === undefined ? ([0, 0, scene.frame.w, scene.frame.h] as const) : region.rect;
  const [u, v] = inverse(scene.camera, (rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2, 0);
  return [snapHalfUp(u, step), snapHalfUp(v, step)];
}

/** Copy position: u increased by the footprint's extent along u, rounded to 6 decimals. */
export function duplicatePosition(scene: Scene, id: string): Vec2 | null {
  const object = scene.objects.find((item) => item.id === id);
  if (object === undefined) return null;
  const box = footprint(scene, object);
  return [round6(object.pos[0] + (box.u1 - box.u0)), object.pos[1]];
}
