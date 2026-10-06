import type { CheckResult } from "../core/types";
import { byId, el, setText } from "./dom";
import { canRedoState, canUndoState, currentScene, isDirty, type EditorState, type EditorStore, type OverlayName, type ViewMode } from "./store";

export interface ToolbarActions {
  readonly open: () => void;
  readonly save: () => void;
}

const MODES: readonly ViewMode[] = ["iso", "plan", "split"];

/** Toolbar: open, save, undo, redo, view mode, snap step, file name. */
export function mountToolbar(store: EditorStore, actions: ToolbarActions): void {
  const app = byId("app");
  const save = byId<HTMLButtonElement>("save");
  const undo = byId<HTMLButtonElement>("undo");
  const redo = byId<HTMLButtonElement>("redo");
  const snap = byId<HTMLSelectElement>("snap");
  const name = byId("file-name");
  const modeButtons = [...document.querySelectorAll<HTMLButtonElement>("button[data-mode]")];
  byId("open").addEventListener("click", actions.open);
  byId("open-empty").addEventListener("click", actions.open);
  save.addEventListener("click", actions.save);
  undo.addEventListener("click", () => store.undo());
  redo.addEventListener("click", () => store.redo());
  snap.addEventListener("change", () => store.setSnap(Number(snap.value)));
  for (const button of modeButtons) {
    button.addEventListener("click", () => store.setMode(button.dataset.mode as ViewMode));
  }
  const render = (state: EditorState): void => {
    const open = currentScene(state) !== null;
    app.dataset.open = String(open);
    app.dataset.mode = state.mode;
    save.disabled = !open;
    undo.disabled = !canUndoState(state);
    redo.disabled = !canRedoState(state);
    for (const b of modeButtons) b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode && MODES.includes(state.mode)));
    if (snap.value !== String(state.snap)) snap.value = String(state.snap);
    setText(name, state.fileName ?? "");
    name.classList.toggle("dirty", open && isDirty(state));
  };
  store.subscribe(render);
  render(store.get());
}

const NOTICE_MS = 7000;

/** Status line: shows the store's notice for a few seconds. */
export function mountStatus(store: EditorStore): void {
  const node = byId("status");
  let timer: number | undefined;
  store.subscribe((state, previous) => {
    if (state.notice === previous.notice) return;
    node.textContent = state.notice?.text ?? "";
    node.classList.toggle("error", state.notice?.kind === "error");
    window.clearTimeout(timer);
    if (state.notice !== null) timer = window.setTimeout(() => store.notify(null), NOTICE_MS);
  });
}

function summary(results: readonly CheckResult[]): string {
  if (results.length === 0) return "";
  const count = (s: CheckResult["status"]) => results.filter((r) => r.status === s).length;
  const parts = (["fail", "warn", "skip", "pass"] as const).flatMap((s) => (count(s) > 0 ? [`${count(s)} ${s}`] : []));
  return `(${parts.join(", ")})`;
}

/** Live check panel: one row per check; tapping a row highlights its objects in both views. */
export function mountChecks(store: EditorStore): void {
  const list = byId("checks-list");
  const count = byId("checks-count");
  let shown: readonly CheckResult[] | null = null;
  const press = (state: EditorState): void => {
    for (const b of list.querySelectorAll<HTMLButtonElement>("button.check")) {
      b.setAttribute("aria-pressed", String(b.dataset.check === state.highlightCheck));
    }
  };
  const render = (state: EditorState): void => {
    if (currentScene(state) === null) {
      shown = null;
      list.replaceChildren(el("li", { class: "hint" }, "No scene is open."));
      setText(count, "");
      return;
    }
    if (state.results === shown) return press(state);
    const previous = shown;
    shown = state.results;
    if (state.results.length === 0) {
      list.replaceChildren(el("li", { class: "hint" }, "This scene has no checks."));
    } else if (previous !== null && previous.length === state.results.length && previous.every((r, i) => (state.results[i] as CheckResult).id === r.id)) {
      const buttons = list.querySelectorAll<HTMLButtonElement>("button.check");
      state.results.forEach((r, i) => {
        if (r !== previous[i]) buttons[i]?.replaceWith(rowButton(store, r));
      });
    } else {
      list.replaceChildren(...state.results.map((r) => el("li", {}, rowButton(store, r))));
    }
    setText(count, summary(state.results));
    press(state);
  };
  store.subscribe((state, previous) => {
    if (state.results !== previous.results || state.history !== previous.history || state.highlightCheck !== previous.highlightCheck) render(state);
  });
  render(store.get());
}

function rowButton(store: EditorStore, r: CheckResult): HTMLButtonElement {
  const button = el(
    "button",
    { type: "button", class: "check", "data-check": r.id, "data-status": r.status, "aria-pressed": "false" },
    el("span", { class: "badge" }, r.status.toUpperCase()),
    el("span", { class: "title" }, `${r.id} ${r.check}`),
    el("span", { class: "message" }, r.message),
  );
  button.addEventListener("click", () => store.highlightCheck(r.id));
  return button;
}

const OVERLAYS: readonly (readonly [OverlayName, string])[] = [
  ["regions", "Frame regions"],
  ["strips", "Strips"],
  ["lanes", "Lanes"],
  ["zones", "Zones"],
  ["anchors", "Anchors"],
  ["labels", "Object labels"],
];

/** Overlay toggles. */
export function mountOverlays(store: EditorStore): void {
  const root = byId("overlays-body");
  const boxes = new Map<OverlayName, HTMLInputElement>();
  for (const [name, text] of OVERLAYS) {
    const box = el("input", { type: "checkbox", "data-overlay": name });
    box.addEventListener("change", () => store.setOverlay(name, box.checked));
    boxes.set(name, box);
    root.append(el("label", {}, box, text));
  }
  const render = (state: EditorState): void => {
    for (const [name, box] of boxes) box.checked = state.overlays[name];
  };
  store.subscribe((state, previous) => {
    if (state.overlays !== previous.overlays) render(state);
  });
  render(store.get());
}
