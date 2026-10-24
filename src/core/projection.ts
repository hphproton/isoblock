import { round } from "./round";
import type { AxesCamera, Camera, Vec2, Vec3, ViewCamera } from "./types";

const DEG = Math.PI / 180;

/** The three screen vectors of a camera (SPEC section 5). */
export interface ScreenAxes {
  readonly axisU: Vec2;
  readonly axisV: Vec2;
  readonly up: Vec2;
}

/** True for the view form (`elevation` and `scale`). The axes form has `angleU`. */
export function isViewCamera(camera: Camera): camera is ViewCamera {
  return "elevation" in camera;
}

/** Unit length `N` (SPEC section 5): `pxPerUnit` in the axes form, `scale` in the view form. */
export function unitLength(camera: Camera): number {
  return isViewCamera(camera) ? camera.scale : camera.pxPerUnit;
}

function axesForm(camera: AxesCamera): ScreenAxes {
  const p = camera.pxPerUnit;
  const au = camera.angleU * DEG;
  const av = camera.angleV * DEG;
  return {
    axisU: [p * Math.cos(au), p * Math.sin(au)],
    axisV: [p * Math.cos(av), p * Math.sin(av)],
    up: [0, -p * (camera.verticalScale ?? 1)],
  };
}

function viewForm(camera: ViewCamera): ScreenAxes {
  const direction = (camera.direction ?? 45) * DEG;
  const elevation = camera.elevation * DEG;
  const scale = camera.scale;
  const sinE = Math.sin(elevation);
  return {
    axisU: [scale * Math.sin(direction), scale * sinE * Math.cos(direction)],
    axisV: [scale * -Math.cos(direction), scale * sinE * Math.sin(direction)],
    up: [0, -scale * Math.cos(elevation)],
  };
}

/** `axisU`, `axisV` and `up` of either camera form (SPEC section 5). */
export function screenAxes(camera: Camera): ScreenAxes {
  return isViewCamera(camera) ? viewForm(camera) : axesForm(camera);
}

/** Solve `a * axisU + b * axisV = target`. */
function solve(axisU: Vec2, axisV: Vec2, target: Vec2): Vec2 {
  const det = axisU[0] * axisV[1] - axisU[1] * axisV[0];
  return [(target[0] * axisV[1] - target[1] * axisV[0]) / det, (axisU[0] * target[1] - axisU[1] * target[0]) / det];
}

/** A `project` function for one camera, with the axes computed once. */
export function projector(camera: Camera): (u: number, v: number, h: number) => Vec2 {
  const ax = screenAxes(camera);
  const [ox, oy] = camera.origin;
  return (u, v, h) => [
    ox + u * ax.axisU[0] + v * ax.axisV[0] + h * ax.up[0],
    oy + u * ax.axisU[1] + v * ax.axisV[1] + h * ax.up[1],
  ];
}

/** Ground point (u, v) at height h to screen (x, y). SPEC section 5. */
export function project(camera: Camera, u: number, v: number, h: number): Vec2 {
  return projector(camera)(u, v, h);
}

/** Screen point to the ground point (u, v) at height `h0`. */
export function inverse(camera: Camera, x: number, y: number, h0 = 0): Vec2 {
  const ax = screenAxes(camera);
  return solve(ax.axisU, ax.axisV, [x - camera.origin[0], y - camera.origin[1] - h0 * ax.up[1]]);
}

/** Camera direction c = (cu, cv, 1): every point on a line along c has one screen point. */
export function cameraDirection(camera: Camera): Vec3 {
  const ax = screenAxes(camera);
  const [cu, cv] = solve(ax.axisU, ax.axisV, [0, -ax.up[1]]);
  return [cu, cv, 1];
}

/**
 * The camera direction as the painter's order uses it (SPEC 13.4): every component rounded to
 * 9 decimals, so that exact ties stay exact in every implementation.
 */
export function orderDirection(camera: Camera): Vec3 {
  const [cu, cv, ch] = cameraDirection(camera);
  return [round(cu, 9), round(cv, 9), ch];
}

/** `cu * u + cv * v + h`: larger means closer to the camera. */
export function depth(c: Vec3, u: number, v: number, h: number): number {
  return c[0] * u + c[1] * v + c[2] * h;
}
