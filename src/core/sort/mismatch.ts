import { boxInfo, pairOrder, type BoxInfo } from "../drawOrder";
import { EPS, type Box } from "../geometry";
import { projector } from "../projection";
import type { Camera, Vec3 } from "../types";
import { boxOutline, convexOverlapArea } from "./outline";
import type { Sprite } from "./sprites";

type Point = readonly [number, number];

/** A piece with what the comparison needs: its ordering numbers and its outline on the screen. */
export interface PreparedPiece {
  readonly box: Box;
  readonly info: BoxInfo;
  readonly outline: readonly Point[];
}

export interface PreparedSprite {
  readonly key: number;
  readonly pieces: readonly PreparedPiece[];
}

export function prepareSprites(sprites: readonly Sprite[], camera: Camera, c: Vec3): readonly PreparedSprite[] {
  const at = projector(camera);
  return sprites.map((s) => ({
    key: s.key,
    pieces: s.pieces.map((p) => ({ box: p.box, info: boxInfo(p.box, camera, c), outline: boxOutline(p.box, at) })),
  }));
}

/** Boxes that overlap by more than EPS along u, along v and along h. */
function intersect(a: Box, b: Box): boolean {
  return (
    Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0) > EPS &&
    Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0) > EPS &&
    Math.min(a.h1, b.h1) - Math.max(a.h0, b.h0) > EPS
  );
}

/**
 * The area drawn in the wrong order for two pieces (SPEC 9.3): the intersection of their outlines
 * when the pieces need an order (SPEC 13.4) and the engine draws them the other way round;
 * `engineFirst` is true when the engine draws `p` before `q`. Pieces whose boxes intersect give 0.
 */
function wrongArea(p: PreparedPiece, q: PreparedPiece, engineFirst: boolean, c: Vec3): number {
  if (intersect(p.box, q.box)) return 0;
  const need = pairOrder(p.info, q.info, c);
  if (need === 0 || (need < 0) === engineFirst) return 0;
  return convexOverlapArea(p.outline, q.outline);
}

/**
 * The largest wrong area between the sprites of two different objects `x` and `y` (object
 * indices, so that equal keys fall back to the sprite list order).
 */
function pairWorst(x: number, a: readonly PreparedSprite[], y: number, b: readonly PreparedSprite[], c: Vec3): number {
  let worst = 0;
  for (const s of a) {
    for (const t of b) {
      const engineFirst = s.key < t.key || (s.key === t.key && x < y);
      for (const p of s.pieces) for (const q of t.pieces) worst = Math.max(worst, wrongArea(p, q, engineFirst, c));
    }
  }
  return worst;
}

/**
 * For each object, the largest wrong area against any other object (SPEC 9.3 step 5). Only pairs
 * with at least one object in `wanted` are measured; the other entries stay 0.
 */
export function staticWorst(objects: readonly (readonly PreparedSprite[])[], wanted: ReadonlySet<number>, c: Vec3): readonly number[] {
  const worst = objects.map(() => 0);
  for (let x = 0; x < objects.length; x++) {
    for (let y = x + 1; y < objects.length; y++) {
      if (!wanted.has(x) && !wanted.has(y)) continue;
      const area = pairWorst(x, objects[x] as readonly PreparedSprite[], y, objects[y] as readonly PreparedSprite[], c);
      worst[x] = Math.max(worst[x] as number, area);
      worst[y] = Math.max(worst[y] as number, area);
    }
  }
  return worst;
}

/** A test actor: a box with its sort key (SPEC 9.3). */
export interface PreparedActor {
  readonly piece: PreparedPiece;
  readonly key: number;
}

export function prepareActor(box: Box, key: number, camera: Camera, c: Vec3): PreparedActor {
  return { piece: { box, info: boxInfo(box, camera, c), outline: boxOutline(box, projector(camera)) }, key };
}

/**
 * The largest wrong area between the sprites of an object and a test actor (SPEC 9.3 step 4): the
 * engine draws the actor after a sprite when the actor key is at least the sprite key.
 */
export function actorWorst(sprites: readonly PreparedSprite[], actor: PreparedActor, c: Vec3): number {
  let worst = 0;
  for (const s of sprites) for (const p of s.pieces) worst = Math.max(worst, wrongArea(p, actor.piece, actor.key >= s.key, c));
  return worst;
}
