import { IsoblockError } from "../errors";
import { addAt, removeAt, replaceAt } from "../jsonEdit";
import { pointerOf, resolvePointer } from "../pointer";
import { hint } from "../suggest";
import type { Command } from "./commands";

type Rec = Readonly<Record<string, unknown>>;
type HideCommand = Extract<Command, { cmd: "hide" | "show" }>;

function fail(message: string): IsoblockError {
  return new IsoblockError("E_PATCH", message);
}

function isRecord(value: unknown): value is Rec {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function listAt(doc: unknown, pointer: string): readonly unknown[] {
  const at = resolvePointer(doc, pointer);
  return at.found && Array.isArray(at.value) ? at.value : [];
}

function objectIds(doc: unknown): readonly string[] {
  return listAt(doc, "/objects").flatMap((o) => (isRecord(o) && typeof o.id === "string" ? [o.id] : []));
}

function objectIndex(doc: unknown, id: string): number {
  const index = listAt(doc, "/objects").findIndex((o) => isRecord(o) && o.id === id);
  if (index < 0) throw fail(`unknown object "${id}"${hint(id, objectIds(doc))}`);
  return index;
}

function stateRecord(doc: unknown): Rec | null {
  const states = resolvePointer(doc, "/states").value;
  return isRecord(states) ? states : null;
}

function stateNames(doc: unknown): readonly string[] {
  const states = stateRecord(doc);
  return states === null ? [] : Object.keys(states);
}

function regionIds(doc: unknown): readonly string[] {
  return listAt(doc, "/frame/regions").flatMap((region) => (isRecord(region) && typeof region.id === "string" ? [region.id] : []));
}

/** Part ids of the object's type. A type without parts has the one part `body`. */
function partIds(doc: unknown, id: string): readonly string[] {
  const index = objectIndex(doc, id);
  const typeName = resolvePointer(doc, pointerOf("objects", index, "type")).value;
  const parts = typeof typeName === "string" ? resolvePointer(doc, pointerOf("types", typeName, "parts")).value : undefined;
  if (!Array.isArray(parts) || parts.length === 0) return ["body"];
  const names = parts.flatMap((part) => (isRecord(part) && typeof part.id === "string" && part.id !== "" ? [part.id] : []));
  return names.length === 0 ? ["body"] : names;
}

type Target =
  | { readonly kind: "object"; readonly id: string }
  | { readonly kind: "region"; readonly id: string }
  | { readonly kind: "part"; readonly id: string; readonly part: string };

/**
 * The second argument of `hide` and `show` (SPEC section 12): an object id, else `region:<id>`,
 * else `<id>/<part>` split at the first slash whose left side is an object id.
 */
function targetOf(doc: unknown, raw: string): Target {
  const ids = objectIds(doc);
  if (ids.includes(raw)) return { kind: "object", id: raw };
  if (raw.startsWith("region:")) return { kind: "region", id: raw.slice("region:".length) };
  const known = new Set(ids);
  for (let at = raw.indexOf("/"); at >= 0; at = raw.indexOf("/", at + 1)) {
    const id = raw.slice(0, at);
    if (known.has(id)) return { kind: "part", id, part: raw.slice(at + 1) };
  }
  const slash = raw.indexOf("/");
  const unknown = slash < 0 ? raw : raw.slice(0, slash);
  throw fail(`unknown object "${unknown}"${hint(unknown, ids)}`);
}

function requireState(doc: unknown, state: string): Rec {
  const states = stateRecord(doc);
  if (states === null || !Object.hasOwn(states, state)) {
    throw fail(`unknown state "${state}"${hint(state, stateNames(doc))}`);
  }
  const def = states[state];
  if (!isRecord(def)) throw fail(`state "${state}" is not an object`);
  return def;
}

function hideObject(doc: unknown, state: string, id: string): unknown {
  objectIndex(doc, id);
  const states = stateRecord(doc);
  if (states === null) return addAt(doc, ["states"], { [state]: { hide: [id] } });
  if (!Object.hasOwn(states, state)) return addAt(doc, ["states", state], { hide: [id] });
  const def = states[state];
  if (!isRecord(def)) throw fail(`state "${state}" is not an object`);
  if (!Object.hasOwn(def, "hide")) return addAt(doc, ["states", state, "hide"], [id]);
  if (!Array.isArray(def.hide)) throw fail(`state "${state}" hide is not a list`);
  if (def.hide.includes(id)) throw fail(`object "${id}" is already hidden in "${state}"`);
  return addAt(doc, ["states", state, "hide", "-"], id);
}

function showObject(doc: unknown, state: string, id: string): unknown {
  objectIndex(doc, id);
  const def = requireState(doc, state);
  const list = Array.isArray(def.hide) ? def.hide : [];
  if (!list.includes(id)) throw fail(`object "${id}" is not hidden in "${state}"`);
  return replaceAt(doc, ["states", state, "hide"], list.filter((item) => item !== id));
}

function partList(doc: unknown, state: string, id: string): readonly unknown[] | null {
  const states = stateRecord(doc);
  if (states === null || !isRecord(states[state])) return null;
  const def = states[state] as Rec;
  if (!isRecord(def.hideParts) || !Object.hasOwn(def.hideParts, id)) return null;
  const list = def.hideParts[id];
  return Array.isArray(list) ? list : null;
}

function hidePart(doc: unknown, state: string, id: string, part: string): unknown {
  const names = partIds(doc, id);
  if (!names.includes(part)) throw fail(`unknown part "${part}" of "${id}"${hint(part, names)}`);
  const states = stateRecord(doc);
  if (states === null) return addAt(doc, ["states"], { [state]: { hideParts: { [id]: [part] } } });
  if (!Object.hasOwn(states, state)) return addAt(doc, ["states", state], { hideParts: { [id]: [part] } });
  const def = states[state];
  if (!isRecord(def)) throw fail(`state "${state}" is not an object`);
  if (!Object.hasOwn(def, "hideParts")) return addAt(doc, ["states", state, "hideParts"], { [id]: [part] });
  if (!isRecord(def.hideParts)) throw fail(`state "${state}" hideParts is not an object`);
  const list = def.hideParts[id];
  if (list === undefined) return addAt(doc, ["states", state, "hideParts", id], [part]);
  if (!Array.isArray(list)) throw fail(`state "${state}" hides parts of "${id}" in a value that is not a list`);
  if (list.includes(part)) throw fail(`part "${part}" of "${id}" is already hidden in "${state}"`);
  return addAt(doc, ["states", state, "hideParts", id, "-"], part);
}

function showPart(doc: unknown, state: string, id: string, part: string): unknown {
  const names = partIds(doc, id);
  if (!names.includes(part)) throw fail(`unknown part "${part}" of "${id}"${hint(part, names)}`);
  const def = requireState(doc, state);
  const list = partList(doc, state, id) ?? [];
  if (!list.includes(part)) throw fail(`part "${part}" of "${id}" is not hidden in "${state}"`);
  const next = list.filter((item) => item !== part);
  if (next.length === 0) return removeAt(doc, ["states", state, "hideParts", id]);
  if (!isRecord(def.hideParts)) throw fail(`state "${state}" hideParts is not an object`);
  return replaceAt(doc, ["states", state, "hideParts", id], next);
}

function regionList(doc: unknown, state: string): readonly unknown[] | null {
  const states = stateRecord(doc);
  if (states === null || !isRecord(states[state])) return null;
  const list = (states[state] as Rec).hideRegions;
  return Array.isArray(list) ? list : null;
}

function hideRegion(doc: unknown, state: string, id: string): unknown {
  const names = regionIds(doc);
  if (!names.includes(id)) throw fail(`unknown region "${id}"${hint(id, names)}`);
  const states = stateRecord(doc);
  if (states === null) return addAt(doc, ["states"], { [state]: { hideRegions: [id] } });
  if (!Object.hasOwn(states, state)) return addAt(doc, ["states", state], { hideRegions: [id] });
  const def = states[state];
  if (!isRecord(def)) throw fail(`state "${state}" is not an object`);
  if (!Object.hasOwn(def, "hideRegions")) return addAt(doc, ["states", state, "hideRegions"], [id]);
  if (!Array.isArray(def.hideRegions)) throw fail(`state "${state}" hideRegions is not a list`);
  if (def.hideRegions.includes(id)) throw fail(`region "${id}" is already hidden in "${state}"`);
  return addAt(doc, ["states", state, "hideRegions", "-"], id);
}

function showRegion(doc: unknown, state: string, id: string): unknown {
  const names = regionIds(doc);
  if (!names.includes(id)) throw fail(`unknown region "${id}"${hint(id, names)}`);
  requireState(doc, state);
  const list = regionList(doc, state) ?? [];
  if (!list.includes(id)) throw fail(`region "${id}" is not hidden in "${state}"`);
  return replaceAt(doc, ["states", state, "hideRegions"], list.filter((item) => item !== id));
}

/** Apply `hide` or `show`, including parts and frame regions (SPEC section 12). */
export function applyVisibility(doc: unknown, command: HideCommand): unknown {
  const target = targetOf(doc, command.id);
  if (target.kind === "object") {
    return command.cmd === "hide" ? hideObject(doc, command.state, target.id) : showObject(doc, command.state, target.id);
  }
  if (target.kind === "region") {
    return command.cmd === "hide" ? hideRegion(doc, command.state, target.id) : showRegion(doc, command.state, target.id);
  }
  return command.cmd === "hide"
    ? hidePart(doc, command.state, target.id, target.part)
    : showPart(doc, command.state, target.id, target.part);
}
