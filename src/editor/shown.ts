import { hiddenIn, withoutObjects } from "../core/states";
import type { Scene } from "../core/types";

/** The select value to keep: `default`, or a state the scene still has. */
export function shownStateName(scene: Scene, shown: string): string {
  if (shown === "default" || Object.hasOwn(scene.states ?? {}, shown)) return shown;
  return "default";
}

/**
 * The state whose hidden objects are left out, or undefined when every object is present.
 * `default` shows every object unless the scene defines a state of that name.
 */
export function activeStateName(scene: Scene, shown: string): string | undefined {
  return Object.hasOwn(scene.states ?? {}, shown) ? shown : undefined;
}

/** The scene as the editor draws it in `shown` (SPEC 10, state switch). */
export function sceneShown(scene: Scene, shown: string): Scene {
  const state = activeStateName(scene, shown);
  return state === undefined ? scene : withoutObjects(scene, hiddenIn(scene, state));
}

/** The selection, cleared when the object is gone or hidden in the state being shown. */
export function keptSelection(scene: Scene, shown: string, selected: string | null): string | null {
  if (selected === null || !scene.objects.some((object) => object.id === selected)) return null;
  const state = activeStateName(scene, shown);
  if (state !== undefined && (scene.states?.[state]?.hide ?? []).includes(selected)) return null;
  return selected;
}
