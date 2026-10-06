import { jsonEqual } from "./jsonEqual";
import { pointerOf } from "./pointer";
import type { Scene } from "./types";

/** One change from scene a to scene b (SPEC section 11.2). */
export interface DiffEntry {
  readonly op: "add" | "remove" | "replace";
  readonly path: string;
  readonly from?: unknown;
  readonly to?: unknown;
}

type Tokens = readonly string[];
type Rec = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Rec {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Order of Unicode code points (a plain `<` on strings compares UTF-16 units). */
function compareCodePoints(a: string, b: string): number {
  const x = Array.from(a, (c) => c.codePointAt(0) as number);
  const y = Array.from(b, (c) => c.codePointAt(0) as number);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number);
  }
  return x.length - y.length;
}

/** The key that identifies the items of the array at `tokens`, when every item in both lists has a unique one. */
function identityKey(tokens: Tokens, a: readonly unknown[], b: readonly unknown[]): string | undefined {
  const key = tokens.length === 1 && tokens[0] === "assumptions" ? "path" : "id";
  const keyed = (list: readonly unknown[]) =>
    list.every((item) => isRecord(item) && typeof item[key] === "string") &&
    new Set(list.map((item) => (item as Rec)[key])).size === list.length;
  return keyed(a) && keyed(b) ? key : undefined;
}

function walk(a: unknown, b: unknown, tokens: Tokens, out: DiffEntry[]): void {
  if (jsonEqual(a, b)) return;
  const path = pointerOf(...tokens);
  if (isRecord(a) && isRecord(b)) {
    for (const key of Object.keys(a)) {
      if (Object.hasOwn(b, key)) walk(a[key], b[key], [...tokens, key], out);
      else out.push({ op: "remove", path: pointerOf(...tokens, key), from: a[key] });
    }
    for (const key of Object.keys(b)) {
      if (!Object.hasOwn(a, key)) out.push({ op: "add", path: pointerOf(...tokens, key), to: b[key] });
    }
    return;
  }
  const key = Array.isArray(a) && Array.isArray(b) ? identityKey(tokens, a, b) : undefined;
  if (key === undefined || !Array.isArray(a) || !Array.isArray(b)) {
    out.push({ op: "replace", path, from: a, to: b });
    return;
  }
  const before = new Map(a.map((item) => [(item as Rec)[key] as string, item]));
  const after = new Map(b.map((item) => [(item as Rec)[key] as string, item]));
  for (const [id, item] of before) {
    if (after.has(id)) walk(item, after.get(id), [...tokens, id], out);
    else out.push({ op: "remove", path: pointerOf(...tokens, id), from: item });
  }
  for (const [id, item] of after) {
    if (!before.has(id)) out.push({ op: "add", path: pointerOf(...tokens, id), to: item });
  }
}

/**
 * Changes from scene `a` to scene `b`, matching items by identity and not by position:
 * arrays of objects with an `id` by `id`, `assumptions` by `path`; every other array is one value.
 * Sorted by path, in code point order.
 */
export function diffScenes(a: Scene, b: Scene): readonly DiffEntry[] {
  const out: DiffEntry[] = [];
  walk(a, b, [], out);
  return out.sort((x, y) => compareCodePoints(x.path, y.path));
}

/** The `--json` output of `diff`. */
export function diffReportJson(a: Scene, b: Scene, changes: readonly DiffEntry[]) {
  return { a: a.id, b: b.id, changes };
}

/** One line per entry: `+ <path> <to>`, `- <path> <from>`, `~ <path> <from> -> <to>`. */
export function diffLine(entry: DiffEntry): string {
  const json = (value: unknown) => JSON.stringify(value);
  if (entry.op === "add") return `+ ${entry.path} ${json(entry.to)}`;
  if (entry.op === "remove") return `- ${entry.path} ${json(entry.from)}`;
  return `~ ${entry.path} ${json(entry.from)} -> ${json(entry.to)}`;
}

/** Text output of `diff`: a summary line, then one line per entry. No trailing newline. */
export function formatDiff(a: Scene, b: Scene, changes: readonly DiffEntry[]): string {
  return [`diff ${a.id} -> ${b.id}: ${changes.length} changes`, ...changes.map(diffLine)].join("\n");
}
