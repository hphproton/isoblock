type Attrs = Readonly<Record<string, string | boolean | undefined>>;

/** Create an element. Attributes set to `false` or `undefined` are left out. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: readonly (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? "" : value);
  }
  node.append(...children);
  return node;
}

export function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`missing element #${id}`);
  return node as T;
}

/** Set text only when it differs, so frequent updates do not cause layout work. */
export function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
