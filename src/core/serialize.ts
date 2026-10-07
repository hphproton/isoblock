import type { Scene } from "./types";

/**
 * Saved format of every JSON file the tool writes: two-space indentation, keys in the order the
 * value has them, one final newline. The same value always gives the same bytes (SPEC section 3,
 * principle 7).
 */
export function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Text of a scene file (SPEC section 10). */
export function serializeScene(scene: Scene): string {
  return serializeJson(scene);
}
