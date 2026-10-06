import { IsoblockError } from "../errors";
import type { Rot } from "../types";

/** A short command of SPEC section 12, parsed but not applied. */
export type Command =
  | { readonly cmd: "move"; readonly id: string; readonly du?: number; readonly dv?: number }
  | { readonly cmd: "rot"; readonly id: string; readonly rot: Rot }
  | { readonly cmd: "set"; readonly pointer: string; readonly value: unknown; readonly note?: string }
  | { readonly cmd: "lock"; readonly id: string; readonly locks: readonly string[] }
  | { readonly cmd: "relate"; readonly id?: string; readonly fields: Readonly<Record<string, unknown>> };

const NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
const OFFSET = /^([uv])([+-])((?:\d+(?:\.\d*)?|\.\d+))$/;
const RANGE = /^(-?(?:\d+(?:\.\d+)?|\.\d+))\.\.(-?(?:\d+(?:\.\d+)?|\.\d+))$/;
const ROTATIONS: readonly string[] = ["0", "90", "180", "270"];
const LOCK_NAMES: readonly string[] = ["pos", "pos.u", "pos.v", "rot", "type"];

function fail(message: string): IsoblockError {
  return new IsoblockError("E_PATCH", message);
}

function numberOf(token: string | undefined, what: string): number {
  if (token === undefined || !NUMBER.test(token)) throw fail(`${what} needs a number, not ${JSON.stringify(token ?? "nothing")}`);
  return Number(token);
}

function rangeOf(token: string | undefined, what: string): readonly [number, number] {
  const m = token === undefined ? null : RANGE.exec(token);
  if (m === null) throw fail(`${what} needs a range like 1..1.5, not ${JSON.stringify(token ?? "nothing")}`);
  return [Number(m[1]), Number(m[2])];
}

function parseMove(args: readonly string[]): Command {
  const [id, ...offsets] = args;
  if (id === undefined || offsets.length < 1 || offsets.length > 2) throw fail("usage: move <id> <u+n|u-n> [<v+n|v-n>]");
  const delta: { du?: number; dv?: number } = {};
  for (const token of offsets) {
    const m = OFFSET.exec(token);
    if (m === null) throw fail(`bad offset "${token}": write an axis and a signed number, like u+0.5`);
    const key = m[1] === "u" ? "du" : "dv";
    if (delta[key] !== undefined) throw fail(`axis ${m[1]} is given twice`);
    delta[key] = Number(m[3]) * (m[2] === "-" ? -1 : 1);
  }
  return { cmd: "move", id, ...delta };
}

function parseRot(args: readonly string[]): Command {
  const [id, rot, extra] = args;
  if (id === undefined || rot === undefined || extra !== undefined) throw fail("usage: rot <id> <0|90|180|270>");
  if (!ROTATIONS.includes(rot)) throw fail(`rotation must be 0, 90, 180 or 270, not "${rot}"`);
  return { cmd: "rot", id, rot: Number(rot) as Rot };
}

/** The value of `set`: JSON when it parses as JSON, else the text itself. */
function readValue(token: string): unknown {
  try {
    return JSON.parse(token);
  } catch {
    return token;
  }
}

function parseSet(args: readonly string[]): Command {
  const [pointer, value, ...rest] = args;
  if (pointer === undefined || value === undefined) throw fail('usage: set <pointer> <value> [note="<text>"]');
  if (!pointer.startsWith("/")) throw fail(`"${pointer}" is not a JSON Pointer below the root`);
  const [note, extra] = rest;
  if (extra !== undefined || (note !== undefined && !note.startsWith("note="))) {
    throw fail(`unexpected "${extra ?? note}" after the value`);
  }
  return { cmd: "set", pointer, value: readValue(value), ...(note === undefined ? {} : { note: note.slice(5) }) };
}

function parseLock(args: readonly string[]): Command {
  const [id, ...locks] = args;
  if (id === undefined || locks.length === 0) throw fail("usage: lock <id> <lock>...");
  for (const lock of locks) {
    if (!LOCK_NAMES.includes(lock) && !lock.startsWith("/")) throw fail(`unknown lock "${lock}"`);
  }
  return { cmd: "lock", id, locks: [...new Set(locks)] };
}

function parseRelate(args: readonly string[]): Command {
  const [a, rel, b, ...options] = args;
  if (a === undefined || rel === undefined || b === undefined) throw fail("usage: relate <a> <rel> <b> [options]");
  const seen = new Set<string>();
  const once = (name: string) => {
    if (seen.has(name)) throw fail(`option "${name}" is given twice`);
    seen.add(name);
  };
  const found: { gap?: readonly number[]; axis?: string; t?: readonly number[]; min?: number; weight?: number; source?: string } = {};
  let id: string | undefined;
  let hard = false;
  for (let i = 0; i < options.length; i++) {
    const token = options[i] as string;
    const name = token.startsWith("id=") ? "id" : token.startsWith("source=") ? "source" : token;
    once(name);
    if (name === "gap") found.gap = rangeOf(options[++i], "gap");
    else if (name === "t") found.t = rangeOf(options[++i], "t");
    else if (name === "min") found.min = numberOf(options[++i], "min");
    else if (name === "weight") found.weight = numberOf(options[++i], "weight");
    else if (name === "hard") hard = true;
    else if (name === "id") id = token.slice(3);
    else if (name === "source") found.source = token.slice(7);
    else if (name === "axis") {
      const axis = options[++i];
      if (axis !== "u" && axis !== "v") throw fail(`axis must be u or v, not ${JSON.stringify(axis ?? "nothing")}`);
      found.axis = axis;
    } else throw fail(`unknown option "${token}"`);
  }
  if (id === "") throw fail("id= needs a value");
  const fields = {
    a, rel, b,
    ...(found.gap === undefined ? {} : { gap: found.gap }),
    ...(found.axis === undefined ? {} : { axis: found.axis }),
    ...(found.t === undefined ? {} : { t: found.t }),
    ...(found.min === undefined ? {} : { min: found.min }),
    hard,
    ...(found.weight === undefined ? {} : { weight: found.weight }),
    ...(found.source === undefined ? {} : { source: found.source }),
  };
  return { cmd: "relate", ...(id === undefined ? {} : { id }), fields };
}

/** Parse the tokens of one command line. Throws `E_PATCH`, or `E_USAGE` for a command of a later stage. */
export function parseCommand(tokens: readonly string[]): Command {
  const [name, ...args] = tokens;
  switch (name) {
    case "move":
      return parseMove(args);
    case "rot":
      return parseRot(args);
    case "set":
      return parseSet(args);
    case "lock":
      return parseLock(args);
    case "relate":
      return parseRelate(args);
    case "solve":
      throw new IsoblockError("E_USAGE", "command 'solve' is added in stage 4");
    default:
      throw fail(`unknown command "${name ?? ""}"`);
  }
}
