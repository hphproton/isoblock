import { jsonEqual } from "../jsonEqual";
import { resolvePointer } from "../pointer";
import type { Scene, SceneObject } from "../types";

type Rec = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Rec {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function itemAt(list: unknown, index: number): unknown {
  return Array.isArray(list) ? list[index] : undefined;
}

/** Objects of scene data by id; the first object with an id wins. */
function objectsById(doc: unknown): ReadonlyMap<string, Rec> {
  const list = resolvePointer(doc, "/objects").value;
  const map = new Map<string, Rec>();
  for (const item of Array.isArray(list) ? list : []) {
    if (isRecord(item) && typeof item.id === "string" && !map.has(item.id)) map.set(item.id, item);
  }
  return map;
}

/** True when the value that `lock` protects differs between the original object and its new version. */
function valueChanged(before: Scene, after: unknown, original: SceneObject, next: Rec, lock: string): boolean {
  switch (lock) {
    case "pos":
      return !jsonEqual(original.pos, next.pos);
    case "pos.u":
      return !jsonEqual(original.pos[0], itemAt(next.pos, 0));
    case "pos.v":
      return !jsonEqual(original.pos[1], itemAt(next.pos, 1));
    case "rot":
      return !jsonEqual(original.rot ?? 0, next.rot ?? 0);
    case "type":
      return original.type !== next.type;
    default: {
      if (!lock.startsWith("/")) return false;
      const was = resolvePointer(before, lock);
      const now = resolvePointer(after, lock);
      return was.found !== now.found || (was.found && !jsonEqual(was.value, now.value));
    }
  }
}

/**
 * Labels `<object id>.<lock>` of the locks of `before` that a patch touches (SPEC section 12):
 * a locked value changes, a lock entry disappears, or a locked object disappears. `after` is
 * scene data that may not be valid yet. Order: objects of `before`, then each object's lock order.
 */
export function touchedLocks(before: Scene, after: unknown): readonly string[] {
  const next = objectsById(after);
  const labels: string[] = [];
  for (const original of before.objects) {
    const now = next.get(original.id);
    for (const lock of original.locks ?? []) {
      const kept = now !== undefined && Array.isArray(now.locks) && now.locks.includes(lock);
      const touched = now === undefined || !kept || valueChanged(before, after, original, now, lock);
      const label = `${original.id}.${lock}`;
      if (touched && !labels.includes(label)) labels.push(label);
    }
  }
  return labels;
}
