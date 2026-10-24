import { IsoblockError } from "./errors";
import type { Scene, SceneObject } from "./types";

/** Part ids of an object's type, in type order. A type without parts has one part, `body`. */
export function partNames(scene: Scene, object: SceneObject): readonly string[] {
  const parts = scene.types[object.type]?.parts;
  return parts === undefined || parts.length === 0 ? ["body"] : parts.map((part) => part.id);
}

/** The ids listed in `hide`. An unknown state name is a usage error (`E_USAGE`). */
export function hiddenIn(scene: Scene, state: string): ReadonlySet<string> {
  const states = scene.states ?? {};
  if (!Object.hasOwn(states, state)) {
    const names = Object.keys(states);
    throw new IsoblockError("E_USAGE", `unknown state '${state}'`, [
      names.length === 0 ? "The scene defines no states." : `The scene defines: ${names.join(", ")}.`,
    ]);
  }
  return new Set(states[state]?.hide ?? []);
}

/**
 * Objects a state hides (SPEC 9.2 and 9.5): those in `hide`, and those whose every part is in
 * `hideParts`. An unknown state name is `E_USAGE`.
 */
export function hiddenObjects(scene: Scene, state: string): ReadonlySet<string> {
  const ids = new Set(hiddenIn(scene, state));
  const parts = scene.states?.[state]?.hideParts ?? {};
  for (const object of scene.objects) {
    const hidden = parts[object.id];
    if (hidden === undefined) continue;
    const all = partNames(scene, object);
    if (all.length > 0 && all.every((id) => hidden.includes(id))) ids.add(object.id);
  }
  return ids;
}

/** The scene without the given objects: hidden objects are not drawn, do not overlap, block or occlude, and count nowhere. */
export function withoutObjects(scene: Scene, hidden: ReadonlySet<string>): Scene {
  return hidden.size === 0 ? scene : { ...scene, objects: scene.objects.filter((o) => !hidden.has(o.id)) };
}

/**
 * The scene as it is in a state (SPEC 9.2, 9.5). Hidden objects are removed. An object that keeps
 * some parts records the hidden ones on `hiddenParts`, and hidden frame regions on `hiddenRegions`.
 * Without a state every object is present.
 */
export function sceneInState(scene: Scene, state: string | undefined): Scene {
  if (state === undefined) return scene;
  const hidden = hiddenObjects(scene, state);
  const def = scene.states?.[state];
  const next = withoutObjects(scene, hidden);
  const kept: Record<string, readonly string[]> = {};
  for (const [id, list] of Object.entries(def?.hideParts ?? {})) {
    if (!hidden.has(id)) kept[id] = list;
  }
  return { ...next, hiddenParts: kept, hiddenRegions: def?.hideRegions ?? [], activeState: state };
}
