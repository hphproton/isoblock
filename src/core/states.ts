import { IsoblockError } from "./errors";
import type { Scene } from "./types";

/** The ids of the objects a state hides. An unknown state name is a usage error (`E_USAGE`). */
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

/** The scene without the given objects: hidden objects are not drawn, do not overlap, block or occlude, and count nowhere. */
export function withoutObjects(scene: Scene, hidden: ReadonlySet<string>): Scene {
  return hidden.size === 0 ? scene : { ...scene, objects: scene.objects.filter((o) => !hidden.has(o.id)) };
}

/** The scene as it is in a state (SPEC section 9.2). Without a state every object is present. */
export function sceneInState(scene: Scene, state: string | undefined): Scene {
  return state === undefined ? scene : withoutObjects(scene, hiddenIn(scene, state));
}
