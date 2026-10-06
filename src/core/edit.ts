import { IsoblockError } from "./errors";
import { axisLock, isPathLocked, lockHolder, lockedAxes } from "./locks";
import { pointerOf } from "./pointer";
import type { Rot, Scene, SceneObject, Vec2 } from "./types";

/**
 * Outcome of an edit. `scene` is the new scene (the input scene when nothing changed).
 * `blocked` lists the lock paths that stopped part or all of the edit.
 */
export interface EditResult {
  readonly scene: Scene;
  readonly blocked: readonly string[];
}

const ROTATIONS: readonly number[] = [0, 90, 180, 270];

function indexOfObject(scene: Scene, id: string): number {
  const index = scene.objects.findIndex((o) => o.id === id);
  if (index < 0) throw new IsoblockError("E_REF", `unknown object "${id}"`);
  return index;
}

function requireFinite(value: number, what: string): void {
  if (!Number.isFinite(value)) throw new IsoblockError("E_USAGE", `${what} must be a finite number`);
}

function replaceObject(scene: Scene, index: number, object: SceneObject): Scene {
  return { ...scene, objects: scene.objects.map((o, i) => (i === index ? object : o)) };
}

/** Keep the value of an assumption in step with the number it describes. */
function syncAssumption(scene: Scene, pointer: string, value: unknown): Scene {
  const list = scene.assumptions;
  if (list === undefined || !list.some((a) => a.path === pointer)) return scene;
  return { ...scene, assumptions: list.map((a) => (a.path === pointer ? { ...a, value } : a)) };
}

/**
 * Move an object to a new `pos`. A locked axis keeps its value. Both axes locked, or only the
 * axis that was asked to change, are reported in `blocked`.
 */
export function moveObject(scene: Scene, id: string, pos: Vec2): EditResult {
  requireFinite(pos[0], "pos.u");
  requireFinite(pos[1], "pos.v");
  const index = indexOfObject(scene, id);
  const object = scene.objects[index] as SceneObject;
  const axes = lockedAxes(object);
  const blocked = new Set<string>();
  let u = object.pos[0];
  let v = object.pos[1];
  if (pos[0] !== u) {
    if (axes.u) blocked.add(axisLock(object, "u"));
    else u = pos[0];
  }
  if (pos[1] !== v) {
    if (axes.v) blocked.add(axisLock(object, "v"));
    else v = pos[1];
  }
  const result = [...blocked];
  if (u === object.pos[0] && v === object.pos[1]) return { scene, blocked: result };
  let next = replaceObject(scene, index, { ...object, pos: [u, v] });
  if (u !== object.pos[0]) next = syncAssumption(next, pointerOf("objects", index, "pos", 0), u);
  if (v !== object.pos[1]) next = syncAssumption(next, pointerOf("objects", index, "pos", 1), v);
  return { scene: next, blocked: result };
}

/** Set the rotation of an object (0, 90, 180 or 270). Blocked by a `rot` lock. */
export function setRotation(scene: Scene, id: string, rot: Rot): EditResult {
  if (!ROTATIONS.includes(rot)) throw new IsoblockError("E_USAGE", `rotation must be 0, 90, 180 or 270, not ${rot}`);
  const index = indexOfObject(scene, id);
  const object = scene.objects[index] as SceneObject;
  if ((object.rot ?? 0) === rot) return { scene, blocked: [] };
  if (isPathLocked(object, "rot")) return { scene, blocked: ["rot"] };
  const next = replaceObject(scene, index, { ...object, rot });
  return { scene: syncAssumption(next, pointerOf("objects", index, "rot"), rot), blocked: [] };
}

/** Change the type of an object. Blocked by a `type` lock; the type must exist. */
export function setObjectType(scene: Scene, id: string, type: string): EditResult {
  if (!Object.hasOwn(scene.types, type)) throw new IsoblockError("E_REF", `unknown type "${type}"`);
  const index = indexOfObject(scene, id);
  const object = scene.objects[index] as SceneObject;
  if (object.type === type) return { scene, blocked: [] };
  if (isPathLocked(object, "type")) return { scene, blocked: ["type"] };
  const next = replaceObject(scene, index, { ...object, type });
  return { scene: syncAssumption(next, pointerOf("objects", index, "type"), type), blocked: [] };
}

/**
 * Set one number of a type's `size` (0 = w, 1 = d, 2 = h). The edit reaches every object of the
 * type, so it is blocked when any object locks the JSON Pointer of that number.
 */
export function setTypeSize(scene: Scene, typeName: string, index: 0 | 1 | 2, value: number): EditResult {
  const type = Object.hasOwn(scene.types, typeName) ? scene.types[typeName] : undefined;
  if (type === undefined) throw new IsoblockError("E_REF", `unknown type "${typeName}"`);
  requireFinite(value, "size");
  if (value < 0) throw new IsoblockError("E_SCHEMA", "size must be 0 or more");
  if (type.size[index] === value) return { scene, blocked: [] };
  const pointer = pointerOf("types", typeName, "size", index);
  if (lockHolder(scene, pointer) !== undefined) return { scene, blocked: [pointer] };
  const size = type.size.map((n, i) => (i === index ? value : n)) as unknown as readonly [number, number, number];
  const next = { ...scene, types: { ...scene.types, [typeName]: { ...type, size } } };
  return { scene: syncAssumption(next, pointer, value), blocked: [] };
}
