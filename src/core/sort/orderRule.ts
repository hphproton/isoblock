import { pairOrder } from "../drawOrder";
import { EPS, type Box } from "../geometry";
import type { Vec3 } from "../types";
import { wrongArea, type PreparedActor, type PreparedPiece, type PreparedSprite } from "./mismatch";
import { convexOverlapArea } from "./outline";

function intersect(a: Box, b: Box): boolean {
  return (
    Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0) > EPS &&
    Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0) > EPS &&
    Math.min(a.h1, b.h1) - Math.max(a.h0, b.h0) > EPS
  );
}

function screensOverlap(a: readonly [number, number, number, number], b: readonly [number, number, number, number]): boolean {
  return a[0] < b[2] - EPS && b[0] < a[2] - EPS && a[1] < b[3] - EPS && b[1] < a[3] - EPS;
}

/**
 * The actor's slot (SPEC 13.4): the largest static order among drawn sprites below the actor,
 * or -1 when none is. A sprite is below when one of its pieces must be drawn before the actor.
 */
export function actorSlot(sprites: readonly PreparedSprite[], actor: PreparedActor, c: Vec3): number {
  let slot = -1;
  for (const sprite of sprites) {
    if (sprite.order <= slot || !screensOverlap(sprite.screen, actor.piece.info.screen)) continue;
    for (const piece of sprite.pieces) {
      if (intersect(piece.box, actor.piece.box)) continue;
      if (pairOrder(actor.piece.info, piece.info, c) > 0) {
        slot = sprite.order;
        break;
      }
    }
  }
  return slot;
}

/** Wrong area between one object's sprites and an actor placed by the order rule (SPEC 9.9). */
export function actorOrderWorst(sprites: readonly PreparedSprite[], actor: PreparedActor, slot: number, c: Vec3): number {
  let worst = 0;
  for (const sprite of sprites) {
    const engineAfter = sprite.order <= slot;
    for (const piece of sprite.pieces) {
      worst = Math.max(worst, actorArea(piece, actor, engineAfter, c));
    }
  }
  return worst;
}

function actorArea(piece: PreparedPiece, actor: PreparedActor, engineAfter: boolean, c: Vec3): number {
  if (intersect(piece.box, actor.piece.box)) return 0;
  const need = pairOrder(actor.piece.info, piece.info, c);
  if (need === 0 || (need > 0) === engineAfter) return 0;
  return convexOverlapArea(piece.outline, actor.piece.outline);
}

/** Largest wrong area between two objects when the engine draws by static order. */
export function orderPairWorst(a: readonly PreparedSprite[], b: readonly PreparedSprite[], c: Vec3): number {
  let worst = 0;
  for (const s of a) {
    for (const t of b) {
      const engineFirst = s.order < t.order;
      for (const p of s.pieces) for (const q of t.pieces) worst = Math.max(worst, wrongArea(p, q, engineFirst, c));
    }
  }
  return worst;
}
