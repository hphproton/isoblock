import { boxInfo, pairOrder, type BoxInfo } from "../drawOrder";
import { EPS, type Box } from "../geometry";
import type { Camera, Scene, Vec3 } from "../types";
import { sceneSprites, type Sprite } from "./sprites";

interface VotePiece {
  readonly box: Box;
  readonly info: BoxInfo;
}

interface VoteSprite {
  readonly key: number;
  readonly index: number;
  readonly pieces: readonly VotePiece[];
  readonly screen: readonly [number, number, number, number];
}

function screensOverlap(a: readonly [number, number, number, number], b: readonly [number, number, number, number]): boolean {
  return a[0] < b[2] - EPS && b[0] < a[2] - EPS && a[1] < b[3] - EPS && b[1] < a[3] - EPS;
}

function intersect(a: Box, b: Box): boolean {
  return (
    Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0) > EPS &&
    Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0) > EPS &&
    Math.min(a.h1, b.h1) - Math.max(a.h0, b.h0) > EPS
  );
}

function screenOf(pieces: readonly VotePiece[]): readonly [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const piece of pieces) {
    const screen = piece.info.screen;
    if (screen[0] < x0) x0 = screen[0];
    if (screen[1] < y0) y0 = screen[1];
    if (screen[2] > x1) x1 = screen[2];
    if (screen[3] > y1) y1 = screen[3];
  }
  return [x0, y0, x1, y1];
}

/** -1 when every vote puts S first, 1 when every vote puts T first, 0 when the sprites need no order. */
function relate(s: VoteSprite, t: VoteSprite, c: Vec3): -1 | 0 | 1 {
  if (!screensOverlap(s.screen, t.screen)) return 0;
  let before = false;
  let after = false;
  for (const p of s.pieces) {
    for (const q of t.pieces) {
      if (intersect(p.box, q.box)) continue;
      const vote = pairOrder(p.info, q.info, c);
      if (vote < 0) before = true;
      else if (vote > 0) after = true;
    }
  }
  if (before === after) return 0;
  return before ? -1 : 1;
}

function earlier(a: VoteSprite, b: VoteSprite): boolean {
  return a.key < b.key || (a.key === b.key && a.index < b.index);
}

/**
 * Static order of sprites in sprite-list order (SPEC 13.4). The number at index i is that
 * sprite's position, 0 first. Equal keys and cycles break toward the smallest key, then the
 * earliest sprite.
 */
export function staticOrder(sprites: readonly Sprite[], camera: Camera, c: Vec3): readonly number[] {
  const items: VoteSprite[] = sprites.map((sprite, index) => {
    const pieces = sprite.pieces.map((piece) => ({ box: piece.box, info: boxInfo(piece.box, camera, c) }));
    return { key: sprite.key, index, pieces, screen: screenOf(pieces) };
  });
  const n = items.length;
  const after: number[][] = items.map(() => []);
  const waiting = items.map(() => 0);
  for (let s = 0; s < n; s++) {
    for (let t = s + 1; t < n; t++) {
      const rel = relate(items[s] as VoteSprite, items[t] as VoteSprite, c);
      if (rel === 0) continue;
      const first = rel < 0 ? s : t;
      const second = rel < 0 ? t : s;
      (after[first] as number[]).push(second);
      waiting[second] = (waiting[second] as number) + 1;
    }
  }
  const placed = new Array<boolean>(n).fill(false);
  const sequence: number[] = [];
  while (sequence.length < n) {
    let best = -1;
    let ready = false;
    for (let i = 0; i < n; i++) {
      if (placed[i]) continue;
      const free = (waiting[i] as number) === 0;
      if (best >= 0 && ready && !free) continue;
      if (best < 0 || (!ready && free) || earlier(items[i] as VoteSprite, items[best] as VoteSprite)) {
        best = i;
        ready = free;
      }
    }
    placed[best] = true;
    sequence.push(best);
    for (const next of after[best] as number[]) waiting[next] = (waiting[next] as number) - 1;
  }
  const order = new Array<number>(n);
  sequence.forEach((index, place) => {
    order[index] = place;
  });
  return order;
}

/** Static order of every object's sprites, keyed by object id, computed with no parts hidden. */
export function spriteOrders(scene: Scene, c: Vec3): ReadonlyMap<string, readonly number[]> {
  const bare = scene.hiddenParts === undefined ? scene : { ...scene, hiddenParts: undefined };
  const groups = sceneSprites(bare);
  const numbers = staticOrder(groups.flat(), bare.camera, c);
  const map = new Map<string, readonly number[]>();
  let cursor = 0;
  bare.objects.forEach((object, index) => {
    const count = groups[index]?.length ?? 0;
    map.set(object.id, numbers.slice(cursor, cursor + count));
    cursor += count;
  });
  return map;
}
