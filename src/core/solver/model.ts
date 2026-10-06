import { IsoblockError } from "../errors";
import { footprint, rectsOverlap, type Rect } from "../geometry";
import { pointerTokens } from "../pointer";
import { projector } from "../projection";
import { prepareRelations, type PreparedRelation } from "../relations/prepare";
import type { Scene, Vec2 } from "../types";

/** What the solver knows about a scene before it moves anything (SPEC section 8). */
export interface SolverModel {
  readonly scene: Scene;
  /** Footprints before solving, indexed like `scene.objects`. */
  readonly origin: readonly Rect[];
  /** Whether the solver may change `pos[0]` (u) and `pos[1]` (v) of each object. */
  readonly freeU: readonly boolean[];
  readonly freeV: readonly boolean[];
  /** Every relation of the scene, in file order. */
  readonly relations: readonly PreparedRelation[];
  /** Pixel rectangle `[x0, y0, x1, y1]` of the view region; `null` when every region blocks the scene. */
  readonly view: readonly [number, number, number, number] | null;
  readonly project: (u: number, v: number) => Vec2;
  /** Keys `i * n + j` (i < j) of the footprint pairs that overlap before solving. */
  readonly overlappedBefore: ReadonlySet<number>;
}

/**
 * True when a pointer lock (absolute, SPEC section 6) protects `pos[axis]` of object `index`:
 * the pointer is that coordinate or a container of it (`/objects/3/pos`, `/objects/3`, `/objects`).
 */
function pointerLocks(pointer: string, index: number, axis: 0 | 1): boolean {
  const target = ["objects", String(index), "pos", String(axis)];
  const tokens = pointerTokens(pointer);
  return tokens.length <= target.length && tokens.every((t, k) => t === target[k]);
}

function axisFree(scene: Scene, index: number, axis: 0 | 1, pointers: readonly string[]): boolean {
  const locks = scene.objects[index]?.locks ?? [];
  if (locks.includes("pos") || locks.includes(axis === 0 ? "pos.u" : "pos.v")) return false;
  return !pointers.some((p) => pointerLocks(p, index, axis));
}

function overlapsBefore(origin: readonly Rect[]): ReadonlySet<number> {
  const n = origin.length;
  const keys = new Set<number>();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) if (rectsOverlap(origin[i] as Rect, origin[j] as Rect)) keys.add(i * n + j);
  }
  return keys;
}

/**
 * Build the solver model. Movable objects are those in `only` (every object when `only` is
 * absent) without a `pos` lock; a `pos.u` or `pos.v` lock, or a pointer lock on the position,
 * fixes that coordinate. Throws `E_USAGE` when `only` names an unknown object.
 */
export function buildModel(scene: Scene, only?: readonly string[]): SolverModel {
  const ids = new Set(scene.objects.map((o) => o.id));
  const unknown = (only ?? []).filter((id) => !ids.has(id));
  if (unknown.length > 0) throw new IsoblockError("E_USAGE", `--only names unknown objects: ${unknown.join(", ")}`);
  const allowed = only === undefined ? ids : new Set(only);
  const pointers = scene.objects.flatMap((o) => (o.locks ?? []).filter((l) => l.startsWith("/")));
  const free = (axis: 0 | 1) => scene.objects.map((o, i) => allowed.has(o.id) && axisFree(scene, i, axis, pointers));
  const origin = scene.objects.map((o) => footprint(scene, o));
  const region = scene.frame.regions.find((r) => r.blocksScene !== true);
  const project = projector(scene.camera);
  return {
    scene,
    origin,
    freeU: free(0),
    freeV: free(1),
    relations: prepareRelations(scene),
    view: region ? region.rect : null,
    project: (u, v) => project(u, v, 0),
    overlappedBefore: overlapsBefore(origin),
  };
}
