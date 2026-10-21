import { shortAssumptionPath } from "../core/describe";
import type { Assumption, Scene } from "../core/types";
import { byId, el } from "./dom";
import { currentScene, type EditorState, type EditorStore } from "./store";

function option(value: string): HTMLOptionElement {
  return el("option", { value }, value);
}

/** Replace the options when the list changes, and keep `selected` when it is one of them. */
function fillSelect(select: HTMLSelectElement, values: readonly string[], selected: string | null): void {
  const key = values.join("\0");
  if (select.dataset.values !== key) {
    const keep = select.value;
    select.replaceChildren(...values.map(option));
    select.dataset.values = key;
    select.value = values.includes(keep) ? keep : values[0] ?? "";
  }
  if (selected !== null && values.includes(selected) && select.value !== selected) select.value = selected;
}

/** State switch, Add, Duplicate and Delete. Found by their accessible names (SPEC 10). */
export function mountEdits(store: EditorStore): void {
  const stateSelect = byId<HTMLSelectElement>("state");
  const typeSelect = byId<HTMLSelectElement>("add-type");
  const add = byId<HTMLButtonElement>("add");
  const duplicate = byId<HTMLButtonElement>("duplicate");
  const remove = byId<HTMLButtonElement>("delete");
  stateSelect.addEventListener("change", () => store.setShownState(stateSelect.value));
  add.addEventListener("click", () => store.addObject(typeSelect.value));
  duplicate.addEventListener("click", () => store.duplicateSelected());
  remove.addEventListener("click", () => store.removeSelected());
  const render = (state: EditorState): void => {
    const scene = currentScene(state);
    const open = scene !== null && state.live === null;
    const names = scene === null ? [] : ["default", ...Object.keys(scene.states ?? {}).filter((name) => name !== "default")];
    fillSelect(stateSelect, names.length === 0 ? ["default"] : names, scene === null ? "default" : state.shownState);
    fillSelect(typeSelect, scene === null ? [] : Object.keys(scene.types), null);
    stateSelect.disabled = scene === null;
    typeSelect.disabled = !open || typeSelect.options.length === 0;
    add.disabled = typeSelect.disabled;
    duplicate.disabled = !open || state.selected === null;
    remove.disabled = !open || state.selected === null;
  };
  store.subscribe(render);
  render(store.get());
}

function valueText(value: unknown): string {
  return typeof value === "number" ? String(value) : JSON.stringify(value) ?? "";
}

/** Assumptions, with Settle then Confirm. Removing an entry is not a patch command. */
export function mountAssumptions(store: EditorStore): void {
  const root = byId("assumptions-body");
  let pending: string | null = null;
  const render = (): void => {
    const state = store.get();
    const scene = currentScene(state);
    if (scene === null) {
      pending = null;
      root.replaceChildren(el("p", { class: "hint" }, "No scene is open."));
      return;
    }
    if (state.live !== null) return;
    const list = scene.assumptions ?? [];
    if (pending !== null && !list.some((entry) => entry.path === pending)) pending = null;
    if (list.length === 0) {
      root.replaceChildren(el("p", { class: "hint" }, "No assumptions."));
      return;
    }
    root.replaceChildren(el("ul", { class: "assumptions" }, ...list.map((entry) => assumptionRow(store, scene, entry, pending, (path) => {
      pending = path;
      render();
    }))));
  };
  store.subscribe((state, previous) => {
    if (state.live !== null) return;
    if (currentScene(state) !== currentScene(previous)) render();
  });
  render();
}

function assumptionRow(
  store: EditorStore,
  scene: Scene,
  entry: Assumption,
  pending: string | null,
  setPending: (path: string | null) => void,
): HTMLLIElement {
  const short = shortAssumptionPath(scene, entry.path);
  const settle = el("button", { type: "button" }, `Settle ${short}`);
  settle.addEventListener("click", () => setPending(entry.path));
  const confirm = el("button", { type: "button" }, "Confirm");
  confirm.addEventListener("click", () => {
    setPending(null);
    store.settleAssumption(entry.path);
  });
  const cancel = el("button", { type: "button" }, "Cancel");
  cancel.addEventListener("click", () => setPending(null));
  const action = pending === entry.path ? [confirm, cancel] : [settle];
  return el(
    "li",
    { class: "assumption" },
    el("span", {}, `${short} = ${valueText(entry.value)}`),
    el("span", {}, entry.owner ?? ""),
    el("span", { class: "note" }, entry.note ?? ""),
    ...action,
  );
}
