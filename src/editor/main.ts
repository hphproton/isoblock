import { serializeScene } from "../core/serialize";
import type { Scene } from "../core/types";
import type { Viewport } from "../core/viewport";
import { byId } from "./dom";
import { describeError, downloadScene, readSceneFile } from "./files";
import { FrameLoop } from "./frames";
import { mountChecks, mountOverlays, mountStatus, mountToolbar } from "./panels";
import { mountProps } from "./props";
import { SceneView, type ViewKind } from "./sceneView";
import { FrameStats, type FrameSnapshot } from "./stats";
import { currentScene, EditorStore, isDirty } from "./store";

/** Read-only view of the editor for tests and tools. It holds no state of its own. */
export interface IsoblockHook {
  scene(): Scene | null;
  /** The text `Save` would write. */
  text(): string | null;
  state(): {
    fileName: string | null;
    selected: string | null;
    highlight: readonly string[];
    dirty: boolean;
    mode: string;
    /** Ids of the checks whose rows are out of date (grid checks during a drag). */
    stale: readonly string[];
  };
  screenOf(view: ViewKind, id: string): readonly [number, number] | null;
  viewport(view: ViewKind): Viewport;
  lockIcons(view: ViewKind): readonly string[];
  /** Pixel ratio of the backing store of a view: lower than the screen's while a gesture moves things. */
  pixelRatio(view: ViewKind): number;
  fit(view: ViewKind): void;
  /** Paint a view completely, as after a resize. */
  redraw(view: ViewKind): void;
  frames: { start(): void; stop(): void; snapshot(): FrameSnapshot };
}

declare global {
  interface Window {
    isoblock?: IsoblockHook;
  }
}

const store = new EditorStore();
const stats = new FrameStats();
const loop = new FrameLoop(stats);

function canvasOf(kind: ViewKind): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>(`figure.view[data-view="${kind}"] canvas`);
  if (canvas === null) throw new Error(`missing canvas for the ${kind} view`);
  return canvas;
}

const views: Record<ViewKind, SceneView> = {
  iso: new SceneView("iso", canvasOf("iso"), store, () => loop.request(), stats),
  plan: new SceneView("plan", canvasOf("plan"), store, () => loop.request(), stats),
};
loop.setViews([views.iso, views.plan]);

function openFile(file: File): void {
  readSceneFile(file).then(
    (scene) => {
      store.open(scene, file.name);
      store.notify(null);
    },
    (error: unknown) => store.notify(describeError(error), "error"),
  );
}

function save(): void {
  const scene = store.get().history?.present;
  if (scene === undefined) return;
  const name = store.get().fileName ?? `${scene.id}.scene.json`;
  downloadScene(scene, name);
  store.markSaved();
  store.notify(`Saved ${name}`, "info");
}

const fileInput = byId<HTMLInputElement>("file");
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file !== undefined) openFile(file);
  fileInput.value = "";
});

mountToolbar(store, { open: () => fileInput.click(), save });
mountStatus(store);
mountProps(byId("props-body"), store);
mountChecks(store);
mountOverlays(store);

for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-fit]")) {
  button.addEventListener("click", () => views[button.dataset.fit as ViewKind].fit());
}

store.subscribe((state, previous) => {
  const redraw =
    currentScene(state) !== currentScene(previous) ||
    state.selected !== previous.selected ||
    state.highlightIds !== previous.highlightIds ||
    state.overlays !== previous.overlays ||
    state.mode !== previous.mode ||
    state.opened !== previous.opened;
  const ended = state.live === null && previous.live !== null;
  if (ended) for (const view of Object.values(views)) view.markFull();
  else if (redraw) for (const view of Object.values(views)) view.markDirty();
});

window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file !== undefined) openFile(file);
});

window.addEventListener("keydown", (e) => {
  const target = e.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === "s") {
    e.preventDefault();
    save();
  } else if (!typing && mod && key === "z") {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
  } else if (!typing && mod && key === "y") {
    e.preventDefault();
    store.redo();
  } else if (key === "escape") {
    store.select(null);
    if (store.get().highlightCheck !== null) store.highlightCheck(store.get().highlightCheck);
  }
});

window.addEventListener("beforeunload", (e) => {
  if (!isDirty(store.get()) || currentScene(store.get()) === null) return;
  e.preventDefault();
  e.returnValue = "";
});

store.setMode(window.matchMedia("(max-width: 860px)").matches ? "iso" : "split");

window.isoblock = {
  scene: () => currentScene(store.get()),
  text: () => {
    const scene = store.get().history?.present;
    return scene === undefined ? null : serializeScene(scene);
  },
  state: () => {
    const s = store.get();
    return { fileName: s.fileName, selected: s.selected, highlight: [...s.highlightIds], dirty: isDirty(s), mode: s.mode, stale: [...s.stale] };
  },
  screenOf: (view, id) => views[view].screenOf(id),
  viewport: (view) => views[view].getViewport(),
  lockIcons: (view) => views[view].lockIcons(),
  pixelRatio: (view) => views[view].pixelRatio(),
  fit: (view) => views[view].fit(),
  redraw: (view) => views[view].markFull(),
  frames: { start: () => stats.start(), stop: () => stats.stop(), snapshot: () => stats.snapshot() },
};
