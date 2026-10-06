import { assumptionAt } from "../core/assumptions";
import { moveObject, setObjectType, setRotation, setTypeSize } from "../core/edit";
import { IsoblockError } from "../core/errors";
import { isPathLocked, lockHolder } from "../core/locks";
import { pointerOf } from "../core/pointer";
import type { Rot, Scene, SceneObject } from "../core/types";
import { el } from "./dom";
import { currentScene, type EditorStore } from "./store";

const LOCKED_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/>' +
  '<path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const UNLOCKED_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/>' +
  '<path d="M5 7V5a3 3 0 0 1 5.6-1.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

/** Longest wait (ms) between two updates of the property readout during a drag. */
const LIVE_INTERVAL_MS = 100;

const ROTATIONS: readonly Rot[] = [0, 90, 180, 270];
const SIZE_NAMES = ["w", "d", "h"] as const;

interface Row {
  readonly node: HTMLElement;
  update(scene: Scene, object: SceneObject, index: number, force: boolean): void;
}

interface LockSpec {
  readonly path: string;
  readonly label: string;
}

/** One numeric property row: how to read it, write it, find its assumption, and lock it. */
interface NumberRow {
  readonly prop: string;
  readonly label: string;
  readonly read: (o: SceneObject, s: Scene) => number;
  readonly write: (value: number, o: SceneObject, s: Scene) => void;
  readonly pointer: (o: SceneObject, i: number) => string;
  readonly lock: LockSpec;
}

function lockButton(store: EditorStore, id: string, spec: LockSpec): { node: HTMLButtonElement; set(scene: Scene, object: SceneObject): void } {
  const node = el("button", {
    type: "button",
    class: "lock",
    "data-lock": spec.path,
    "aria-pressed": "false",
    "aria-label": `Lock ${spec.label}`,
  });
  node.innerHTML = UNLOCKED_ICON;
  node.addEventListener("click", () => store.setLock(id, spec.path, node.getAttribute("aria-pressed") !== "true"));
  return {
    node,
    set(scene, object) {
      const pointer = spec.path.startsWith("/");
      const holder = pointer ? lockHolder(scene, spec.path) : undefined;
      const pressed = pointer ? holder !== undefined : isPathLocked(object, spec.path);
      const inherited = !pointer && pressed && !(object.locks ?? []).includes(spec.path);
      const byOther = holder !== undefined && holder !== object.id;
      setAttr(node, "aria-pressed", String(pressed));
      const disabled = inherited || byOther;
      if (node.disabled !== disabled) node.disabled = disabled;
      const title = inherited ? "Locked by pos" : byOther ? `Locked by ${holder}` : pressed ? `Unlock ${spec.label}` : `Lock ${spec.label}`;
      if (node.title !== title) node.title = title;
      if (node.dataset.icon !== String(pressed)) {
        node.dataset.icon = String(pressed);
        node.innerHTML = pressed ? LOCKED_ICON : UNLOCKED_ICON;
      }
    },
  };
}

function markNode(prop: string): { node: HTMLElement; set(scene: Scene, pointer: string): void } {
  const node = el("span", { class: "mark", "data-mark": prop, hidden: true }, "*");
  return {
    node,
    set(scene, pointer) {
      const a = assumptionAt(scene, pointer);
      const hidden = a === undefined;
      if (node.hidden !== hidden) node.hidden = hidden;
      if (a === undefined) return;
      const text = `Provisional value${a.note === undefined ? "" : `: ${a.note}`}${a.owner === undefined ? "" : ` (owner: ${a.owner})`}`;
      if (node.title !== text) {
        node.title = text;
        node.setAttribute("aria-label", text);
      }
    },
  };
}

function setAttr(node: Element, name: string, value: string): void {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

/** Show a value in a control. A control being typed in keeps its text unless `force` is set. */
function setValue(input: HTMLInputElement | HTMLSelectElement, value: string, force: boolean): void {
  if ((force || document.activeElement !== input) && input.value !== value) input.value = value;
}

function row(name: string, control: HTMLElement, unit: string, mark: HTMLElement | null, lock: HTMLElement | null): HTMLElement {
  return el(
    "div",
    { class: "field" },
    el("span", { class: "name" }, name),
    el("span", { class: "control" }, control, el("span", { class: "unit" }, unit), ...(mark === null ? [] : [mark])),
    lock ?? el("span"),
  );
}

/** Build the property rows of one object. `update` copies the current scene into the controls. */
function buildProps(store: EditorStore, scene: Scene, object: SceneObject): { root: HTMLElement; update(scene: Scene): void } {
  const id = object.id;
  const typeName = object.type;
  const unit = scene.units.name;
  const rows: Row[] = [];
  /** Show the real values again after an edit was tried: an edit that was refused must not leave the typed text. */
  const refresh = () => {
    const now = currentScene(store.get());
    if (now !== null) update(now, true);
  };
  const attempt = (change: () => void) => {
    try {
      change();
    } catch (e) {
      store.notify(e instanceof IsoblockError ? e.message : String(e), "error");
    }
    refresh();
  };
  const number = (spec: NumberRow) => {
    const input = el("input", {
      type: "number",
      step: "any",
      inputmode: "decimal",
      "data-prop": spec.prop,
      "aria-label": `${spec.label} (${unit})`,
    });
    const mark = markNode(spec.prop);
    const toggle = lockButton(store, id, spec.lock);
    input.addEventListener("change", () => {
      const value = input.value.trim() === "" ? Number.NaN : Number(input.value);
      attempt(() => {
        const s = currentScene(store.get());
        const o = s?.objects.find((x) => x.id === id);
        if (s === null || o === undefined) return;
        if (!Number.isFinite(value)) throw new IsoblockError("E_USAGE", `${spec.label} must be a number`);
        spec.write(value, o, s);
      });
    });
    rows.push({
      node: row(spec.prop, input, unit, mark.node, toggle.node),
      update(s, o, i, force) {
        setValue(input, String(spec.read(o, s)), force);
        input.step = store.get().snap > 0 ? String(store.get().snap) : "any";
        mark.set(s, spec.pointer(o, i));
        toggle.set(s, o);
      },
    });
  };

  const typeSelect = el("select", { "data-prop": "type", "aria-label": "Type" }, ...Object.keys(scene.types).map((t) => el("option", { value: t }, t)));
  typeSelect.addEventListener("change", () => {
    attempt(() => {
      const s = currentScene(store.get());
      if (s !== null) store.edit(setObjectType(s, id, typeSelect.value), id);
    });
  });
  const typeMark = markNode("type");
  const typeLock = lockButton(store, id, { path: "type", label: "type" });
  rows.push({
    node: row("type", typeSelect, "", typeMark.node, typeLock.node),
    update(s, o, i, force) {
      setValue(typeSelect, o.type, force);
      typeMark.set(s, pointerOf("objects", i, "type"));
      typeLock.set(s, o);
    },
  });

  const posLock = lockButton(store, id, { path: "pos", label: "pos" });
  const position = el("div", { class: "group-title props-title" }, el("span", {}, "Position"), posLock.node);
  rows.push({ node: position, update: (s, o) => posLock.set(s, o) });
  for (const axis of [0, 1] as const) {
    const name = axis === 0 ? "u" : "v";
    number({
      prop: name,
      label: `pos.${name}`,
      read: (o) => o.pos[axis],
      write: (value, o, s) => store.edit(moveObject(s, id, axis === 0 ? [value, o.pos[1]] : [o.pos[0], value]), id),
      pointer: (_o, i) => pointerOf("objects", i, "pos", axis),
      lock: { path: `pos.${name}`, label: `pos.${name}` },
    });
  }

  const rotSelect = el("select", { "data-prop": "rot", "aria-label": "Rotation" }, ...ROTATIONS.map((r) => el("option", { value: String(r) }, String(r))));
  rotSelect.addEventListener("change", () => {
    attempt(() => {
      const s = currentScene(store.get());
      if (s !== null) store.edit(setRotation(s, id, Number(rotSelect.value) as Rot), id);
    });
  });
  const rotMark = markNode("rot");
  const rotLock = lockButton(store, id, { path: "rot", label: "rot" });
  rows.push({
    node: row("rot", rotSelect, "deg", rotMark.node, rotLock.node),
    update(s, o, i, force) {
      setValue(rotSelect, String(o.rot ?? 0), force);
      rotMark.set(s, pointerOf("objects", i, "rot"));
      rotLock.set(s, o);
    },
  });

  rows.push({ node: el("div", { class: "group-title" }, `Size of type ${typeName}`), update: () => undefined });
  for (const k of [0, 1, 2] as const) {
    const label = SIZE_NAMES[k];
    const pointer = pointerOf("types", typeName, "size", k);
    number({
      prop: label,
      label: `size.${label}`,
      read: (_o, s) => s.types[typeName]?.size[k] ?? 0,
      write: (value, _o, s) => store.edit(setTypeSize(s, typeName, k, value), id),
      pointer: () => pointer,
      lock: { path: pointer, label: `size.${label}` },
    });
  }

  const root = el("div", {}, el("div", { class: "props-title" }, el("strong", {}, id)), ...rows.map((r) => r.node));
  function update(s: Scene, force = false): void {
    const index = s.objects.findIndex((o) => o.id === id);
    const o = s.objects[index];
    if (o === undefined) return;
    for (const r of rows) r.update(s, o, index, force);
  }
  update(scene);
  return { root, update };
}

/** The property panel: shows the selected object, with a lock toggle and provisional mark per number. */
export function mountProps(root: HTMLElement, store: EditorStore): void {
  let current: { id: string; type: string; update(scene: Scene): void } | null = null;
  const render = (): void => {
    const state = store.get();
    const scene = currentScene(state);
    const object = scene === null || state.selected === null ? undefined : scene.objects.find((o) => o.id === state.selected);
    if (scene === null || object === undefined) {
      current = null;
      root.replaceChildren(el("p", { class: "hint" }, scene === null ? "No scene is open." : "Select an object in a view."));
      return;
    }
    if (current === null || current.id !== object.id || current.type !== object.type) {
      const built = buildProps(store, scene, object);
      current = { id: object.id, type: object.type, update: built.update };
      root.replaceChildren(built.root);
      return;
    }
    current.update(scene);
  };
  // While an object is dragged the readout follows at a few updates a second; the end of the drag updates it at once.
  let lastRender = Number.NEGATIVE_INFINITY;
  let trailing: number | undefined;
  const renderNow = (): void => {
    window.clearTimeout(trailing);
    trailing = undefined;
    lastRender = performance.now();
    render();
  };
  store.subscribe((state, previous) => {
    // The end of a drag keeps the same scene object, so it is detected on its own.
    const dragEnded = previous.live !== null && state.live === null;
    const changed =
      dragEnded || state.selected !== previous.selected || currentScene(state) !== currentScene(previous) || state.snap !== previous.snap;
    if (!changed) return;
    const wait = LIVE_INTERVAL_MS - (performance.now() - lastRender);
    if (state.live === null || state.selected !== previous.selected || wait <= 0) renderNow();
    else if (trailing === undefined) trailing = window.setTimeout(renderNow, wait);
  });
  render();
}
