import { IsoblockError, withPrefix } from "../errors";
import { addAt } from "../jsonEdit";
import { jsonEqual } from "../jsonEqual";
import { resolvePointer } from "../pointer";
import { applyCommand } from "./applyCommand";
import { applyJsonPatch } from "./jsonPatch";
import type { ParsedPatch } from "./parse";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Set every `assumptions[].value` to the value its `path` points to (SPEC section 12). A path that does not resolve is left for validation. */
export function followAssumptions(doc: unknown): unknown {
  const list = resolvePointer(doc, "/assumptions").value;
  if (!Array.isArray(list)) return doc;
  return list.reduce<unknown>((current, item, k) => {
    if (!isRecord(item) || typeof item.path !== "string") return current;
    const target = resolvePointer(current, item.path);
    if (!target.found || (Object.hasOwn(item, "value") && jsonEqual(item.value, target.value))) return current;
    return addAt(current, ["assumptions", String(k), "value"], target.value);
  }, doc);
}

/**
 * Apply a parsed patch to scene data, step by step, on new data; the input is never changed, so
 * a failing step leaves nothing behind (the patch is atomic). Afterwards every assumption
 * follows the value at its path. Throws `E_PATCH`. The result has not been validated.
 */
export function applyPatch(doc: unknown, patch: ParsedPatch): unknown {
  if (patch.kind === "json") return followAssumptions(applyJsonPatch(doc, patch.ops));
  const done = patch.commands.reduce<unknown>((current, { line, command }) => {
    try {
      return applyCommand(current, command);
    } catch (e) {
      if (e instanceof IsoblockError) throw withPrefix(e, `line ${line}`);
      throw e;
    }
  }, doc);
  return followAssumptions(done);
}
