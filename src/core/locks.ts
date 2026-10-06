import { IsoblockError } from "./errors";
import type { Scene, SceneObject } from "./types";

export interface LockedAxes {
  readonly u: boolean;
  readonly v: boolean;
}

/** Canonical order of the lock list; JSON Pointer locks follow, sorted. */
const ORDER = ["pos", "pos.u", "pos.v", "rot", "type"] as const;

function rank(path: string): number {
  const i = (ORDER as readonly string[]).indexOf(path);
  return i < 0 ? ORDER.length : i;
}

function compareLocks(a: string, b: string): number {
  return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
}

/** True when the object's `locks` list blocks `path`. A `pos` lock covers `pos.u` and `pos.v`. */
export function isPathLocked(object: SceneObject, path: string): boolean {
  const locks = object.locks ?? [];
  if (locks.includes(path)) return true;
  return (path === "pos.u" || path === "pos.v") && locks.includes("pos");
}

/** Which ground axes of `pos` the object's locks block. */
export function lockedAxes(object: SceneObject): LockedAxes {
  return { u: isPathLocked(object, "pos.u"), v: isPathLocked(object, "pos.v") };
}

/** The lock entry that blocks an axis of `pos`: `pos` when the whole position is locked, else `pos.u` or `pos.v`. */
export function axisLock(object: SceneObject, axis: "u" | "v"): "pos" | "pos.u" | "pos.v" {
  return isPathLocked(object, "pos") ? "pos" : axis === "u" ? "pos.u" : "pos.v";
}

/** Id of the first object whose locks list the JSON Pointer, or undefined. */
export function lockHolder(scene: Scene, pointer: string): string | undefined {
  return scene.objects.find((o) => (o.locks ?? []).includes(pointer))?.id;
}

function withLocks(object: SceneObject, locks: readonly string[]): SceneObject {
  const { locks: _old, ...rest } = object;
  return locks.length === 0 ? rest : { ...rest, locks };
}

/** Add or remove one lock entry. Returns the same scene when nothing changes. Throws `E_REF` for an unknown object. */
export function setLock(scene: Scene, objectId: string, path: string, locked: boolean): Scene {
  const index = scene.objects.findIndex((o) => o.id === objectId);
  if (index < 0) throw new IsoblockError("E_REF", `unknown object "${objectId}"`);
  const object = scene.objects[index] as SceneObject;
  const current = object.locks ?? [];
  if (current.includes(path) === locked) return scene;
  const kept = locked ? [...current, path] : current.filter((p) => p !== path);
  const next = path === "pos" && locked ? kept.filter((p) => p !== "pos.u" && p !== "pos.v") : kept;
  const objects = scene.objects.map((o, i) => (i === index ? withLocks(object, [...next].sort(compareLocks)) : o));
  return { ...scene, objects };
}
