import { IsoblockError, withPrefix } from "../errors";
import { addAt, removeAt, replaceAt } from "../jsonEdit";
import { jsonEqual } from "../jsonEqual";
import { pointerTokens, resolvePointer } from "../pointer";

/** One operation of a JSON Patch (RFC 6902). */
export type JsonOp =
  | { readonly op: "add" | "replace" | "test"; readonly path: string; readonly value: unknown }
  | { readonly op: "remove"; readonly path: string }
  | { readonly op: "move" | "copy"; readonly path: string; readonly from: string };

const NEEDS_VALUE: readonly string[] = ["add", "replace", "test"];
const NEEDS_FROM: readonly string[] = ["move", "copy"];

function fail(message: string): IsoblockError {
  return new IsoblockError("E_PATCH", message);
}

function pointerOk(value: unknown): value is string {
  return typeof value === "string" && (value === "" || value.startsWith("/"));
}

function parseOp(item: unknown, index: number): JsonOp {
  const where = `operation ${index + 1}`;
  if (item === null || typeof item !== "object" || Array.isArray(item)) throw fail(`${where}: must be an object`);
  const o = item as Readonly<Record<string, unknown>>;
  const name = o.op;
  if (typeof name !== "string" || ![...NEEDS_VALUE, ...NEEDS_FROM, "remove"].includes(name)) {
    throw fail(`${where}: unknown op ${JSON.stringify(name ?? null)}`);
  }
  if (!pointerOk(o.path)) throw fail(`${where}: "path" must be a JSON Pointer`);
  if (NEEDS_VALUE.includes(name) && !Object.hasOwn(o, "value")) throw fail(`${where}: "${name}" needs a "value"`);
  if (NEEDS_FROM.includes(name) && !pointerOk(o.from)) throw fail(`${where}: ${name} needs a source JSON Pointer`);
  return o as unknown as JsonOp;
}

/** Parse the text of a JSON Patch. Throws `E_PATCH`. */
export function parseJsonPatch(text: string): readonly JsonOp[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw fail(`malformed JSON Patch: ${(e as Error).message}`);
  }
  if (!Array.isArray(value)) throw fail("a JSON Patch must be an array of operations");
  return value.map(parseOp);
}

function applyOp(doc: unknown, op: JsonOp): unknown {
  const to = pointerTokens(op.path);
  switch (op.op) {
    case "add":
      return addAt(doc, to, op.value);
    case "replace":
      return replaceAt(doc, to, op.value);
    case "remove":
      return removeAt(doc, to);
    case "test": {
      const at = resolvePointer(doc, op.path);
      if (!at.found || !jsonEqual(at.value, op.value)) throw fail("test failed: the value at the path is not the expected one");
      return doc;
    }
    default: {
      const source = resolvePointer(doc, op.from);
      if (!source.found) throw fail(`the source path does not exist: ${op.from}`);
      if (op.op === "copy") return addAt(doc, to, source.value);
      if (op.from === op.path) return doc;
      if (op.path.startsWith(`${op.from}/`)) throw fail("the source path is a parent of the target path");
      return addAt(removeAt(doc, pointerTokens(op.from)), to, source.value);
    }
  }
}

/** Apply the operations in order to `doc`. Returns new data. Throws `E_PATCH` naming the operation. */
export function applyJsonPatch(doc: unknown, ops: readonly JsonOp[]): unknown {
  return ops.reduce<unknown>((current, op, i) => {
    try {
      return applyOp(current, op);
    } catch (e) {
      if (e instanceof IsoblockError) throw withPrefix(e, `operation ${i + 1} (${op.op} ${op.path})`);
      throw e;
    }
  }, doc);
}
