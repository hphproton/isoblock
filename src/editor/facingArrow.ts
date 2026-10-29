import { project } from "../core/projection";
import type { Camera, Vec2, Vec3 } from "../core/types";

/** Length of the short facing arrow, in world units (SPEC section 10). */
export const FACING_SHAFT = 0.6;

/** Arrow head length in CSS pixels. The view scale turns this into display pixels. */
export const ARROW_HEAD = 12;

/** How wide the head is, as a share of its length. */
const SPREAD = 0.75;

export interface ArrowDraw {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
}

/**
 * Screen triangle of the arrow head at `tip`, pointing along the shaft from `from`.
 * The first point is the tip. Null when the shaft has no length on screen.
 */
export function arrowHead(camera: Camera, from: Vec3, tip: Vec3, scale: number): readonly [Vec2, Vec2, Vec2] | null {
  const start = project(camera, from[0], from[1], from[2]);
  const end = project(camera, tip[0], tip[1], tip[2]);
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len = Math.hypot(dx, dy);
  if (len <= 1e-9 || !(scale > 0)) return null;
  const ux = dx / len;
  const uy = dy / len;
  const head = ARROW_HEAD / scale;
  const spread = head * SPREAD;
  const back: Vec2 = [end[0] - ux * head, end[1] - uy * head];
  return [end, [back[0] - uy * spread, back[1] + ux * spread], [back[0] + uy * spread, back[1] - ux * spread]];
}

/** Fill the arrow head. Returns false when the shaft has no length on screen. */
export function traceArrowHead(camera: Camera, from: Vec3, tip: Vec3, scale: number, draw: ArrowDraw): boolean {
  const head = arrowHead(camera, from, tip, scale);
  if (head === null) return false;
  const [tipPoint, left, right] = head;
  draw.beginPath();
  draw.moveTo(tipPoint[0], tipPoint[1]);
  draw.lineTo(left[0], left[1]);
  draw.lineTo(right[0], right[1]);
  draw.closePath();
  draw.fill();
  return true;
}
