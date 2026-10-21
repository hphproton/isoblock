import { addPosition, decimal, duplicatePosition, freshId } from "../core/place";
import type { Scene } from "../core/types";

/** A signed decimal for `move`, such as `+0.1` or `-1`. */
export function signedDecimal(n: number): string {
  const body = decimal(Math.abs(n));
  return n < 0 ? `-${body}` : `+${body}`;
}

/** `move` for one arrow key. Shift uses a step of 1; a step of 0 is not a move. */
export function nudgeLine(id: string, key: string, step: number): string | null {
  const axis = key === "ArrowLeft" || key === "ArrowRight" ? "u" : key === "ArrowUp" || key === "ArrowDown" ? "v" : null;
  if (axis === null || !(step > 0)) return null;
  const sign = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  return `move ${id} ${axis}${signedDecimal(sign * step)}`;
}

/** `add` for the Add button: a fresh id at the snapped view center, rotation 0. */
export function addLine(scene: Scene, type: string, step: number): { readonly id: string; readonly line: string } {
  const id = freshId(scene, type);
  const [u, v] = addPosition(scene, step);
  return { id, line: `add ${id} ${type} ${decimal(u)},${decimal(v)}` };
}

/** `add` for Duplicate: the same type and rotation, placed beside the original along u. */
export function duplicateLine(scene: Scene, id: string): { readonly id: string; readonly line: string } | null {
  const object = scene.objects.find((item) => item.id === id);
  const pos = duplicatePosition(scene, id);
  if (object === undefined || pos === null) return null;
  const copy = freshId(scene, object.type);
  return { id: copy, line: `add ${copy} ${object.type} ${decimal(pos[0])},${decimal(pos[1])} ${object.rot ?? 0}` };
}
