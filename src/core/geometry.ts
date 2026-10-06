import type { Rot, Scene, SceneObject, Vec2 } from "./types";

/** Comparison constant of SPEC section 9.1. */
export const EPS = 1e-9;

/** Ground rectangle: u0 <= u1, v0 <= v1. */
export interface Rect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/** Axis-aligned box in world units. */
export interface Box {
  readonly u0: number;
  readonly v0: number;
  readonly h0: number;
  readonly u1: number;
  readonly v1: number;
  readonly h1: number;
}

export interface WorldPart {
  readonly id: string;
  readonly box: Box;
}

export function rotationOf(object: SceneObject): Rot {
  return object.rot ?? 0;
}

export function indexObjects(scene: Scene): ReadonlyMap<string, SceneObject> {
  return new Map(scene.objects.map((o) => [o.id, o]));
}

function typeSize(scene: Scene, object: SceneObject): readonly [number, number, number] {
  return (scene.types[object.type] as { size: readonly [number, number, number] }).size;
}

/** Map a point in type coordinates to world (u, v). Rotation is about the footprint center. */
function toWorld(object: SceneObject, w: number, d: number, x: number, y: number): Vec2 {
  const [pu, pv] = object.pos;
  switch (rotationOf(object)) {
    case 90:
      return [pu + d - y, pv + x];
    case 180:
      return [pu + w - x, pv + d - y];
    case 270:
      return [pu + y, pv + w - x];
    default:
      return [pu + x, pv + y];
  }
}

/** A point in type coordinates (`x` along u, `y` along v) mapped to world (u, v) for the object's `pos` and `rot`. */
export function worldPoint(scene: Scene, object: SceneObject, x: number, y: number): Vec2 {
  const [w, d] = typeSize(scene, object);
  return toWorld(object, w, d, x, y);
}

/** Footprint rectangle after rotation: `pos` is its (min u, min v) corner. */
export function footprint(scene: Scene, object: SceneObject): Rect {
  const [w, d] = typeSize(scene, object);
  const turned = rotationOf(object) === 90 || rotationOf(object) === 270;
  return {
    u0: object.pos[0],
    v0: object.pos[1],
    u1: object.pos[0] + (turned ? d : w),
    v1: object.pos[1] + (turned ? w : d),
  };
}

/** The whole `size` box of an object in world units. */
export function sizeBox(scene: Scene, object: SceneObject): Box {
  const f = footprint(scene, object);
  return { u0: f.u0, v0: f.v0, h0: 0, u1: f.u1, v1: f.v1, h1: typeSize(scene, object)[2] };
}

/** Parts of an object in world units. A type without parts has one part, the whole size box. */
export function worldParts(scene: Scene, object: SceneObject): readonly WorldPart[] {
  const type = scene.types[object.type] as NonNullable<Scene["types"][string]>;
  if (!type.parts || type.parts.length === 0) return [{ id: "body", box: sizeBox(scene, object) }];
  const [w, d] = type.size;
  return type.parts.map((part) => {
    const [u0, v0, h0, u1, v1, h1] = part.box;
    const a = toWorld(object, w, d, u0, v0);
    const b = toWorld(object, w, d, u1, v1);
    return {
      id: part.id,
      box: {
        u0: Math.min(a[0], b[0]),
        v0: Math.min(a[1], b[1]),
        h0: Math.min(h0, h1),
        u1: Math.max(a[0], b[0]),
        v1: Math.max(a[1], b[1]),
        h1: Math.max(h0, h1),
      },
    };
  });
}

/** Two rectangles overlap when the intersections along u and along v both exceed EPS. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0) > EPS && Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0) > EPS;
}

/** Edge-to-edge distance between two rectangles (0 when they touch or overlap). */
export function rectGap(a: Rect, b: Rect): number {
  return Math.hypot(Math.max(0, b.u0 - a.u1, a.u0 - b.u1), Math.max(0, b.v0 - a.v1, a.v0 - b.v1));
}

/** The four footprint corners, in order (u0,v0) (u1,v0) (u1,v1) (u0,v1). */
export function rectCorners(r: Rect): readonly Vec2[] {
  return [
    [r.u0, r.v0],
    [r.u1, r.v0],
    [r.u1, r.v1],
    [r.u0, r.v1],
  ];
}
