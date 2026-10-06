import type { Assumption, Scene } from "./types";

/** The assumption recorded for a JSON Pointer, if any: that number is provisional (SPEC section 6). */
export function assumptionAt(scene: Scene, pointer: string): Assumption | undefined {
  return (scene.assumptions ?? []).find((a) => a.path === pointer);
}
