import type { Scene } from "./types";

/**
 * Text of a scene file: two-space indentation, keys in the order they have in the scene, one
 * final newline. The same scene always gives the same bytes (SPEC section 3, principle 7).
 */
export function serializeScene(scene: Scene): string {
  return `${JSON.stringify(scene, null, 2)}\n`;
}
