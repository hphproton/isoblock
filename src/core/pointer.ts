/** Split a JSON Pointer (RFC 6901) into decoded tokens. `""` gives no tokens. */
export function pointerTokens(pointer: string): readonly string[] {
  if (pointer === "") return [];
  return pointer
    .slice(1)
    .split("/")
    .map((t) => t.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/** Follow a JSON Pointer through plain data. */
export function resolvePointer(root: unknown, pointer: string): { found: boolean; value?: unknown } {
  let node: unknown = root;
  for (const token of pointerTokens(pointer)) {
    if (Array.isArray(node)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token) || Number(token) >= node.length) return { found: false };
      node = node[Number(token)];
    } else if (node !== null && typeof node === "object" && Object.hasOwn(node, token)) {
      node = (node as Record<string, unknown>)[token];
    } else {
      return { found: false };
    }
  }
  return { found: true, value: node };
}

/** Build a JSON Pointer (RFC 6901) from tokens, escaping `~` and `/`. */
export function pointerOf(...tokens: readonly (string | number)[]): string {
  return tokens.map((t) => `/${String(t).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}
