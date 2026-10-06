import { round6 } from "../checks/result";
import { IsoblockError } from "../errors";
import { addAt, replaceAt } from "../jsonEdit";
import { pointerOf, pointerTokens, resolvePointer } from "../pointer";
import type { Command } from "./commands";

type Rec = Readonly<Record<string, unknown>>;

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

/** Index of the object with this id; fails when there is none. */
function objectIndex(doc: unknown, id: string): number {
  const index = listAt(doc, "/objects").findIndex((o) => isRecord(o) && o.id === id);
  if (index < 0) throw fail(`unknown object "${id}"`);
  return index;
}

function positionOf(doc: unknown, index: number): readonly [number, number] {
  const pos = resolvePointer(doc, `/objects/${index}/pos`).value;
  if (!Array.isArray(pos) || typeof pos[0] !== "number" || typeof pos[1] !== "number") throw fail("the object has no valid pos");
  return [pos[0], pos[1]];
}

function move(doc: unknown, c: Extract<Command, { cmd: "move" }>): unknown {
  const index = objectIndex(doc, c.id);
  const [u, v] = positionOf(doc, index);
  const at = (axis: number) => ["objects", String(index), "pos", String(axis)];
  const moved = c.du === undefined ? doc : replaceAt(doc, at(0), round6(u + c.du));
  return c.dv === undefined ? moved : replaceAt(moved, at(1), round6(v + c.dv));
}

/** Footprint (w, d) of an object for a rotation, from its type's size. */
function footprintOf(doc: unknown, index: number, rot: number): readonly [number, number] {
  const type = resolvePointer(doc, `/objects/${index}/type`).value;
  const size = typeof type === "string" ? resolvePointer(doc, pointerOf("types", type, "size")).value : undefined;
  if (!Array.isArray(size) || typeof size[0] !== "number" || typeof size[1] !== "number") throw fail("the object has no known type size");
  return rot % 180 === 0 ? [size[0], size[1]] : [size[1], size[0]];
}

function rotate(doc: unknown, c: Extract<Command, { cmd: "rot" }>): unknown {
  const index = objectIndex(doc, c.id);
  const now = resolvePointer(doc, `/objects/${index}/rot`);
  const current = now.found && typeof now.value === "number" ? now.value : 0;
  if (current === c.rot) return doc;
  const [u, v] = positionOf(doc, index);
  const [w0, d0] = footprintOf(doc, index, current);
  const [w1, d1] = footprintOf(doc, index, c.rot);
  const base = ["objects", String(index)];
  const turned = addAt(doc, [...base, "rot"], c.rot);
  if (w0 === w1 && d0 === d1) return turned;
  return replaceAt(turned, [...base, "pos"], [round6(u + w0 / 2 - w1 / 2), round6(v + d0 / 2 - d1 / 2)]);
}

function setValue(doc: unknown, c: Extract<Command, { cmd: "set" }>): unknown {
  if (!resolvePointer(doc, c.pointer).found) throw fail(`pointer "${c.pointer}" does not resolve`);
  const next = replaceAt(doc, pointerTokens(c.pointer), c.value);
  if (c.note === undefined) return next;
  const k = listAt(next, "/assumptions").findIndex((a) => isRecord(a) && a.path === c.pointer);
  if (k < 0) throw fail(`there is no assumption for "${c.pointer}" to take the note`);
  return addAt(next, ["assumptions", String(k), "note"], c.note);
}

function lock(doc: unknown, c: Extract<Command, { cmd: "lock" }>): unknown {
  const index = objectIndex(doc, c.id);
  const at = resolvePointer(doc, `/objects/${index}/locks`);
  if (at.found && (!Array.isArray(at.value) || at.value.some((l) => typeof l !== "string"))) throw fail("the object's locks are not a list");
  const have = (at.found ? at.value : []) as readonly string[];
  const added = c.locks.filter((l) => !have.includes(l));
  if (added.length === 0) return doc;
  return addAt(doc, ["objects", String(index), "locks"], [...have, ...added]);
}

function relate(doc: unknown, c: Extract<Command, { cmd: "relate" }>): unknown {
  const root = resolvePointer(doc, "/relations");
  if (root.found && !Array.isArray(root.value)) throw fail("relations is not a list");
  const list = listAt(doc, "/relations");
  const used = new Set(list.map((r) => (isRecord(r) ? r.id : undefined)));
  let n = 1;
  while (used.has(`r${n}`)) n++;
  const relation = { id: c.id ?? `r${n}`, ...c.fields };
  return root.found ? addAt(doc, ["relations", "-"], relation) : addAt(doc, ["relations"], [relation]);
}

/** Apply one short command to scene data. Returns new data. Throws `E_PATCH`. */
export function applyCommand(doc: unknown, command: Command): unknown {
  switch (command.cmd) {
    case "move":
      return move(doc, command);
    case "rot":
      return rotate(doc, command);
    case "set":
      return setValue(doc, command);
    case "lock":
      return lock(doc, command);
    case "relate":
      return relate(doc, command);
  }
}
