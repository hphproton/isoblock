import { runChecks } from "../checks";
import { diffScenes, type DiffEntry } from "../diff";
import { IsoblockError, type ErrorCode } from "../errors";
import type { Scene } from "../types";
import { validateScene } from "../validate";
import { applyPatch } from "./apply";
import { checkChanges, failingCount, type CheckChange } from "./changes";
import { parsePatch } from "./parse";
import { touchedLocks } from "./touched";

export interface PatchError {
  readonly code: ErrorCode;
  readonly message: string;
}

/** Everything `patch` reports about one patch (SPEC section 12). */
export interface PatchOutcome {
  /** The scene the patch was applied to. */
  readonly scene: Scene;
  readonly status: "applied" | "rejected" | "invalid";
  readonly error: PatchError | null;
  readonly locks: readonly string[];
  readonly diff: readonly DiffEntry[];
  readonly checks: readonly CheckChange[];
  /** Number of `fail` or `skip` results after the patch; `null` unless the patch is applied. */
  readonly failing: number | null;
  /** First comment line of the patch, or `null`. */
  readonly description: string | null;
  /** The patched scene; `null` unless the patch is applied. */
  readonly result: Scene | null;
}

/** An error as the report shows it: the details are joined into the message. */
export function patchError(e: IsoblockError): PatchError {
  const detail = e.details.length > 0 ? `: ${e.details.join("; ")}` : "";
  return { code: e.code, message: `${e.message}${detail}` };
}

/**
 * Apply a patch file to a valid scene. The order of outcomes is fixed: a malformed or failing
 * patch is `invalid`; then a touched lock makes it `rejected` (`E_LOCK`); then a result that does
 * not validate is `invalid` (`E_SCHEMA`, `E_REF`); otherwise it is `applied`.
 */
export function runPatch(scene: Scene, patchText: string): PatchOutcome {
  const empty = { scene, locks: [], diff: [], checks: [], failing: null, result: null } as const;
  let description: string | null = null;
  let raw: unknown;
  try {
    const patch = parsePatch(patchText);
    description = patch.description;
    raw = applyPatch(scene, patch);
  } catch (e) {
    if (!(e instanceof IsoblockError)) throw e;
    return { ...empty, status: "invalid", error: patchError(e), description };
  }
  const locks = touchedLocks(scene, raw);
  if (locks.length > 0) {
    const error = { code: "E_LOCK", message: `the patch touches locks: ${locks.join(", ")}` } as const;
    return { ...empty, status: "rejected", error, locks, description };
  }
  let result: Scene;
  try {
    result = validateScene(raw);
  } catch (e) {
    if (!(e instanceof IsoblockError)) throw e;
    return { ...empty, status: "invalid", error: patchError(e), description };
  }
  const after = runChecks(result);
  return {
    scene, status: "applied", error: null, locks: [], description, result,
    diff: diffScenes(scene, result),
    checks: checkChanges(runChecks(scene), after),
    failing: failingCount(after),
  };
}
