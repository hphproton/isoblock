import type { Camera, Vec2 } from "./types";
import { project } from "./projection";

/** Display coordinates to canvas pixels: `canvas = display * scale + (tx, ty)`. */
export interface Viewport {
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
}

export interface Bounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface ZoomLimits {
  readonly min: number;
  readonly max: number;
}

/** Scale and offset that show `bounds` whole and centred in a canvas, with a margin in pixels. */
export function fitViewport(bounds: Bounds, width: number, height: number, margin = 16): Viewport {
  const w = bounds.x1 - bounds.x0;
  const h = bounds.y1 - bounds.y0;
  const room = [width - 2 * margin, height - 2 * margin] as const;
  if (!(w > 0) || !(h > 0) || !(room[0] > 0) || !(room[1] > 0)) return { scale: 1, tx: 0, ty: 0 };
  const scale = Math.min(room[0] / w, room[1] / h);
  return {
    scale,
    tx: margin + (room[0] - w * scale) / 2 - bounds.x0 * scale,
    ty: margin + (room[1] - h * scale) / 2 - bounds.y0 * scale,
  };
}

export function toCanvas(vp: Viewport, p: Vec2): Vec2 {
  return [p[0] * vp.scale + vp.tx, p[1] * vp.scale + vp.ty];
}

export function fromCanvas(vp: Viewport, p: Vec2): Vec2 {
  return [(p[0] - vp.tx) / vp.scale, (p[1] - vp.ty) / vp.scale];
}

/** Change the scale by `factor` (within `limits`) and keep the display point under `at` where it is. */
export function zoomAt(vp: Viewport, at: Vec2, factor: number, limits: ZoomLimits): Viewport {
  const scale = Math.min(limits.max, Math.max(limits.min, vp.scale * factor));
  const [x, y] = fromCanvas(vp, at);
  return { scale, tx: at[0] - x * scale, ty: at[1] - y * scale };
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { scale: vp.scale, tx: vp.tx + dx, ty: vp.ty + dy };
}

/** Display bounds of a ground rectangle `[u0, v0, u1, v1]` seen through a camera, at height 0. */
export function groundBounds(extent: readonly [number, number, number, number], camera: Camera): Bounds {
  const [u0, v0, u1, v1] = extent;
  const corners = [project(camera, u0, v0, 0), project(camera, u1, v0, 0), project(camera, u1, v1, 0), project(camera, u0, v1, 0)];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
