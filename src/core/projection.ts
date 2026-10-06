import type { Camera, Vec2, Vec3 } from "./types";

const DEG = Math.PI / 180;

interface Axes {
  readonly ux: number;
  readonly uy: number;
  readonly vx: number;
  readonly vy: number;
  readonly upY: number;
}

function axes(camera: Camera): Axes {
  const p = camera.pxPerUnit;
  return {
    ux: p * Math.cos(camera.angleU * DEG),
    uy: p * Math.sin(camera.angleU * DEG),
    vx: p * Math.cos(camera.angleV * DEG),
    vy: p * Math.sin(camera.angleV * DEG),
    upY: -p * (camera.verticalScale ?? 1),
  };
}

/** Solve `a * axisU + b * axisV = (x, y)`. */
function solve(ax: Axes, x: number, y: number): Vec2 {
  const det = ax.ux * ax.vy - ax.uy * ax.vx;
  return [(x * ax.vy - y * ax.vx) / det, (ax.ux * y - ax.uy * x) / det];
}

/** Ground point (u, v) at height h to screen (x, y). SPEC section 5. */
export function project(camera: Camera, u: number, v: number, h: number): Vec2 {
  const ax = axes(camera);
  return [camera.origin[0] + u * ax.ux + v * ax.vx, camera.origin[1] + u * ax.uy + v * ax.vy + h * ax.upY];
}

/** Screen point to the ground point (u, v) at height `h0`. */
export function inverse(camera: Camera, x: number, y: number, h0 = 0): Vec2 {
  const ax = axes(camera);
  return solve(ax, x - camera.origin[0], y - camera.origin[1] - h0 * ax.upY);
}

/** Camera direction c = (cu, cv, 1): every point on a line along c has one screen point. */
export function cameraDirection(camera: Camera): Vec3 {
  const ax = axes(camera);
  const [cu, cv] = solve(ax, 0, -ax.upY);
  return [cu, cv, 1];
}

/** `cu * u + cv * v + h`: larger means closer to the camera. */
export function depth(c: Vec3, u: number, v: number, h: number): number {
  return c[0] * u + c[1] * v + c[2] * h;
}
