import { IsoblockError } from "./errors";

type Record_ = Readonly<Record<string, unknown>>;
/** Applies the last step of a path to the container that holds the target. */
type Leaf = (container: unknown, token: string) => unknown;

const INDEX = /^(0|[1-9][0-9]*)$/;

function fail(message: string): IsoblockError {
  return new IsoblockError("E_PATCH", message);
}

function isRecord(value: unknown): value is Record_ {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function indexOf(token: string, list: readonly unknown[], end: boolean): number {
  if (end && token === "-") return list.length;
  const i = INDEX.test(token) ? Number(token) : -1;
  if (i < 0 || i > list.length || (i === list.length && !end)) throw fail(`no array item at "${token}"`);
  return i;
}

/** Rebuild the path down to the container of the target, sharing everything else. */
function descend(node: unknown, tokens: readonly string[], leaf: Leaf): unknown {
  const [head, ...rest] = tokens as [string, ...string[]];
  if (rest.length === 0) return leaf(node, head);
  if (Array.isArray(node)) {
    const at = indexOf(head, node, false);
    return node.map((item, k) => (k === at ? descend(item, rest, leaf) : item));
  }
  if (isRecord(node) && Object.hasOwn(node, head)) return { ...node, [head]: descend(node[head], rest, leaf) };
  throw fail(`path does not exist at "${head}"`);
}

function edit(root: unknown, tokens: readonly string[], leaf: Leaf): unknown {
  if (tokens.length === 0) throw fail("the whole scene cannot be replaced");
  return descend(root, tokens, leaf);
}

/** RFC 6902 `add`: insert into an array (`-` appends) or set an object member. Returns new data. */
export function addAt(root: unknown, tokens: readonly string[], value: unknown): unknown {
  return edit(root, tokens, (container, token) => {
    if (Array.isArray(container)) {
      const at = indexOf(token, container, true);
      return [...container.slice(0, at), value, ...container.slice(at)];
    }
    if (isRecord(container)) return { ...container, [token]: value };
    throw fail(`cannot add below a ${container === null ? "null" : typeof container} value`);
  });
}

/** RFC 6902 `replace`: the target must exist. Returns new data. */
export function replaceAt(root: unknown, tokens: readonly string[], value: unknown): unknown {
  return edit(root, tokens, (container, token) => {
    if (Array.isArray(container)) {
      const at = indexOf(token, container, false);
      return container.map((item, k) => (k === at ? value : item));
    }
    if (isRecord(container) && Object.hasOwn(container, token)) return { ...container, [token]: value };
    throw fail(`path does not exist at "${token}"`);
  });
}

/** RFC 6902 `remove`: the target must exist. Returns new data. */
export function removeAt(root: unknown, tokens: readonly string[]): unknown {
  return edit(root, tokens, (container, token) => {
    if (Array.isArray(container)) {
      const at = indexOf(token, container, false);
      return container.filter((_, k) => k !== at);
    }
    if (isRecord(container) && Object.hasOwn(container, token)) {
      return Object.fromEntries(Object.entries(container).filter(([k]) => k !== token));
    }
    throw fail(`path does not exist at "${token}"`);
  });
}
