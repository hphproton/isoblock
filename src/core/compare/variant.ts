import { IsoblockError, withPrefix } from "../errors";
import { jsonEqual } from "../jsonEqual";
import { applyPatch } from "../patch/apply";
import { looksLikeScene, parsePatch } from "../patch/parse";
import { touchedLocks } from "../patch/touched";
import type { Scene } from "../types";
import { parseScene, validateScene } from "../validate";

/** A variant after it was applied to the base scene. */
export interface AppliedVariant {
  /** The variant scene, with the base scene's checks. */
  readonly scene: Scene;
  /** Labels of the base locks the variant touches. They do not stop `compare`. */
  readonly locks: readonly string[];
  /** First comment line of a patch variant, or `null`. */
  readonly description: string | null;
}

/** The scene with the checks of the base, so that every column of `compare` runs the same checks. */
function withBaseChecks(base: Scene, scene: Scene): Scene {
  if (jsonEqual(scene.checks, base.checks)) return scene;
  const { checks: _own, ...rest } = scene;
  return validateScene(base.checks === undefined ? rest : { ...rest, checks: base.checks });
}

function applyText(base: Scene, text: string): AppliedVariant {
  if (looksLikeScene(text)) {
    const scene = parseScene(text);
    return { scene: withBaseChecks(base, scene), locks: touchedLocks(base, scene), description: null };
  }
  const patch = parsePatch(text);
  const raw = applyPatch(base, patch);
  return { scene: withBaseChecks(base, validateScene(raw)), locks: touchedLocks(base, raw), description: patch.description };
}

/**
 * Apply a variant file to a copy of the base scene (SPEC section 11.1). A variant is a patch
 * (section 12) or another scene file (a JSON object). Locks are ignored but recorded. Throws
 * `E_PATCH`, `E_USAGE`, `E_JSON_PARSE`, `E_SCHEMA` or `E_REF`, naming the variant.
 */
export function applyVariant(base: Scene, name: string, text: string): AppliedVariant {
  try {
    return applyText(base, text);
  } catch (e) {
    if (e instanceof IsoblockError) throw withPrefix(e, `variant ${name}`);
    throw e;
  }
}
