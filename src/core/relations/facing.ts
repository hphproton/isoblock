import { footprint, type Rect } from "../geometry";
import { EPS } from "../geometry";
import { fmt } from "../format";
import { insidePolygon } from "../polygon";
import { nearestOnSegment, SATISFIED, centerAlong, type Measure, type Rects } from "./shared";
import type { Target } from "./targets";
import type { Lane, Rot, Scene, Vec2 } from "../types";

const FRONTS: Readonly<Record<string, Vec2>> = {
  "+u": [1, 0],
  "-u": [-1, 0],
  "+v": [0, 1],
  "-v": [0, -1],
};

/** The unit front after `rot`: at 90, +u becomes +v and +v becomes -u (SPEC section 6). */
export function turnedFront(front: string | undefined, rot: number): Vec2 | null {
  const base = front === undefined ? undefined : FRONTS[front];
  if (base === undefined) return null;
  const [x, y] = base;
  if (rot === 90) return [-y, x];
  if (rot === 180) return [-x, -y];
  if (rot === 270) return [y, -x];
  return [x, y];
}

/** An anchor's ground point from the footprint's min corner, the same map as `worldPoint`. */
function placed(rect: Rect, rot: Rot, w: number, d: number, x: number, y: number): Vec2 {
  switch (rot) {
    case 90:
      return [rect.u0 + d - y, rect.v0 + x];
    case 180:
      return [rect.u0 + w - x, rect.v0 + d - y];
    case 270:
      return [rect.u0 + y, rect.v0 + w - x];
    default:
      return [rect.u0 + x, rect.v0 + y];
  }
}

function center(rect: Rect): Vec2 {
  return [centerAlong(rect, "u"), centerAlong(rect, "v")];
}

/** The point of the polyline nearest to p; the first along the lane when several are equally near. */
function nearestOnLane(lane: Lane, u: number, v: number): Vec2 {
  let best: Vec2 = [lane.points[0]?.[0] ?? u, lane.points[0]?.[1] ?? v];
  let bestD = Infinity;
  for (let i = 1; i < lane.points.length; i++) {
    const a = lane.points[i - 1] as readonly number[];
    const b = lane.points[i] as readonly number[];
    const q = nearestOnSegment(u, v, a[0] as number, a[1] as number, b[0] as number, b[1] as number);
    if (q.distance < bestD - EPS) {
      bestD = q.distance;
      best = [q.u, q.v];
    }
  }
  return best;
}

function nearestBoundary(points: readonly Vec2[], u: number, v: number): Vec2 {
  let best: Vec2 = points[0] ?? [u, v];
  let bestD = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j] as Vec2;
    const b = points[i] as Vec2;
    const q = nearestOnSegment(u, v, a[0], a[1], b[0], b[1]);
    if (q.distance < bestD - EPS) {
      bestD = q.distance;
      best = [q.u, q.v];
    }
  }
  return best;
}

export interface FacingFigure {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly front: Vec2;
}

interface FacingSource {
  readonly point: (rects: Rects) => Vec2;
  readonly front: Vec2;
}

function sourceOf(scene: Scene, target: Target): FacingSource | string {
  if (target.kind === "object") {
    const object = scene.objects[target.index];
    const front = turnedFront(object === undefined ? undefined : scene.types[object.type]?.front, object?.rot ?? 0);
    if (front === null || object === undefined) return `type "${object?.type ?? ""}" has no front`;
    return { point: (rects) => center(rects[target.index] as Rect), front };
  }
  if (target.kind === "anchor") {
    const object = scene.objects[target.index];
    const front = turnedFront(target.anchor.front, object?.rot ?? 0);
    if (front === null || object === undefined) return `anchor "${target.anchor.id}" has no front`;
    const [w, d] = scene.types[object.type]?.size ?? [0, 0];
    const [x, y] = target.anchor.at;
    return {
      point: (rects) => placed(rects[target.index] as Rect, object.rot ?? 0, w, d, x, y),
      front,
    };
  }
  return "a must be an object or an anchor";
}

function targetPoint(scene: Scene, target: Target, from: Vec2): Vec2 | string {
  if (target.kind === "object") {
    const rect = footprint(scene, scene.objects[target.index] as NonNullable<(typeof scene.objects)[number]>);
    return center(rect);
  }
  if (target.kind === "zone") {
    const points = target.zone.points ?? [];
    if (points.length < 3) return `zone "${target.zone.id}" has ${points.length} points; facing needs 3 or more`;
    return insidePolygon(points, from[0], from[1]) ? from : nearestBoundary(points, from[0], from[1]);
  }
  if (target.kind === "lane") {
    let length = 0;
    for (let i = 1; i < target.lane.points.length; i++) {
      const a = target.lane.points[i - 1] as readonly number[];
      const b = target.lane.points[i] as readonly number[];
      length += Math.hypot((b[0] as number) - (a[0] as number), (b[1] as number) - (a[1] as number));
    }
    if (length <= EPS) return `lane "${target.lane.id}" has zero length`;
    return nearestOnLane(target.lane, from[0], from[1]);
  }
  return "b must be an object, a zone or a lane";
}

/** Angle in degrees between the unit front and T - F, or 0 when the two points coincide. */
function angleDeg(front: Vec2, from: Vec2, to: Vec2): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len <= EPS) return 0;
  const dot = Math.max(-1, Math.min(1, (front[0] * dx + front[1] * dy) / len));
  return (Math.acos(dot) * 180) / Math.PI;
}

/**
 * `facing` (SPEC section 7): the angle between the front and the direction to the target.
 * The violation is the excess over `angle`, in radians.
 */
export function facingMeasure(scene: Scene, a: Target, b: Target, angle: number): Measure | string {
  const source = sourceOf(scene, a);
  if (typeof source === "string") return source;
  const sample = (rects: Rects): { readonly theta: number; readonly from: Vec2; readonly to: Vec2 } | string => {
    const from = source.point(rects);
    const to = targetPoint(scene, b, from);
    if (typeof to === "string") return to;
    // An object target moves with the footprints the solver tries.
    const at = b.kind === "object" ? center(rects[b.index] as Rect) : to;
    return { theta: angleDeg(source.front, from, at), from, to: at };
  };
  const first = sample(scene.objects.map((object) => footprint(scene, object)));
  if (typeof first === "string") return first;
  const violation = (rects: Rects) => {
    const got = sample(rects);
    const theta = typeof got === "string" ? 180 : got.theta;
    return Math.max(0, theta - angle) * Math.PI / 180;
  };
  return {
    violation,
    message: (rects) => {
      const got = sample(rects);
      const theta = typeof got === "string" ? 0 : got.theta;
      const v = violation(rects);
      return `angle ${fmt(theta)} deg, wanted <= ${fmt(angle)}${v > SATISFIED ? ` (violation ${fmt(v)})` : ""}`;
    },
  };
}

/** The line and the front arrow of a measured `facing` relation, or null when it is skipped. */
export function facingFigure(scene: Scene, a: Target, b: Target): FacingFigure | null {
  const source = sourceOf(scene, a);
  if (typeof source === "string") return null;
  const rects = scene.objects.map((object) => footprint(scene, object));
  const from = source.point(rects);
  const to = targetPoint(scene, b, from);
  if (typeof to === "string") return null;
  const at = b.kind === "object" ? center(rects[b.index] as Rect) : to;
  return { from, to: at, front: source.front };
}
