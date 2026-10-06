import { IsoblockError } from "./errors";
import { moveObject, type EditResult } from "./edit";
import { axisLock, lockedAxes } from "./locks";
import { inverse } from "./projection";
import type { Camera, Scene, Vec2 } from "./types";

/**
 * Ground movement that a pointer move causes, on the plane at height `h`. The difference of two
 * inverse projections does not depend on `h`; the height is part of the call so that a drag keeps
 * the grabbed point under the pointer (SPEC section 10: screen to ground, keeping h).
 */
export function groundDelta(camera: Camera, from: Vec2, to: Vec2, h = 0): Vec2 {
  const a = inverse(camera, from[0], from[1], h);
  const b = inverse(camera, to[0], to[1], h);
  return [b[0] - a[0], b[1] - a[1]];
}

/** Round to the nearest multiple of `step` (any value when `step` is 0), with 6 decimals at most. */
export function snapValue(value: number, step: number): number {
  const snapped = step > 0 ? Math.round(value / step) * step : value;
  return Math.round(snapped * 1e6) / 1e6;
}

/** An object grabbed at a display point. */
export interface DragStart {
  readonly id: string;
  /** `pos` of the object when it was grabbed. */
  readonly pos: Vec2;
  /** Display point where the pointer went down. */
  readonly point: Vec2;
}

/**
 * Scene with the grabbed object moved to where the pointer is, snapped to the grid. Pass the scene
 * from before the drag, so that every call is relative to the start and nothing drifts. A locked
 * axis keeps its value; `blocked` names the lock when the pointer asked for more than half a step
 * of movement along it.
 */
export function dragTo(scene: Scene, camera: Camera, start: DragStart, point: Vec2, step: number, h = 0): EditResult {
  const object = scene.objects.find((o) => o.id === start.id);
  if (object === undefined) throw new IsoblockError("E_REF", `unknown object "${start.id}"`);
  const [du, dv] = groundDelta(camera, start.point, point, h);
  const axes = lockedAxes(object);
  const tolerance = step > 0 ? step / 2 : 1e-9;
  const blocked: string[] = [];
  const target: Vec2 = [
    axes.u ? start.pos[0] : snapValue(start.pos[0] + du, step),
    axes.v ? start.pos[1] : snapValue(start.pos[1] + dv, step),
  ];
  if (axes.u && Math.abs(du) >= tolerance) blocked.push(axisLock(object, "u"));
  if (axes.v && Math.abs(dv) >= tolerance && !blocked.includes(axisLock(object, "v"))) blocked.push(axisLock(object, "v"));
  const result = moveObject(scene, start.id, target);
  return { scene: result.scene, blocked };
}
