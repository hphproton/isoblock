import { runChecks } from "../core/checks";
import type { EditResult } from "../core/edit";
import { canRedo, canUndo, commit, redo, startHistory, undo, type History } from "../core/history";
import { updateResults } from "../core/incremental";
import { setLock } from "../core/locks";
import type { CheckResult, Scene } from "../core/types";

export type OverlayName = "regions" | "strips" | "lanes" | "zones" | "anchors" | "labels";
export type ViewMode = "iso" | "plan" | "split";

export interface Notice {
  readonly kind: "info" | "error";
  readonly text: string;
}

/** Everything the editor knows. The scene file is the only thing that outlives the page. */
export interface EditorState {
  readonly fileName: string | null;
  readonly history: History<Scene> | null;
  /** Scene being previewed during a drag; it is not in the history until it is committed. */
  readonly live: Scene | null;
  /** Scene as it was opened or last saved. */
  readonly saved: Scene | null;
  readonly results: readonly CheckResult[];
  /** The scene that `results` belong to. */
  readonly resultsScene: Scene | null;
  readonly selected: string | null;
  readonly highlightCheck: string | null;
  readonly highlightIds: ReadonlySet<string>;
  readonly overlays: Readonly<Record<OverlayName, boolean>>;
  readonly snap: number;
  readonly mode: ViewMode;
  readonly notice: Notice | null;
  /** Counts the scene files opened so far; views refit when it changes. */
  readonly opened: number;
}

export type Listener = (state: EditorState, previous: EditorState) => void;

const NO_IDS: ReadonlySet<string> = new Set();

const INITIAL: EditorState = {
  fileName: null,
  history: null,
  live: null,
  saved: null,
  results: [],
  resultsScene: null,
  selected: null,
  highlightCheck: null,
  highlightIds: NO_IDS,
  overlays: { regions: true, strips: true, lanes: true, zones: true, anchors: false, labels: false },
  snap: 0.1,
  mode: "split",
  notice: null,
  opened: 0,
};

export function currentScene(state: EditorState): Scene | null {
  return state.live ?? state.history?.present ?? null;
}

export function isDirty(state: EditorState): boolean {
  return currentScene(state) !== state.saved;
}

export function canUndoState(state: EditorState): boolean {
  return state.history !== null && state.live === null && canUndo(state.history);
}

export function canRedoState(state: EditorState): boolean {
  return state.history !== null && state.live === null && canRedo(state.history);
}

function idsOf(results: readonly CheckResult[], checkId: string | null): ReadonlySet<string> {
  const row = checkId === null ? undefined : results.find((r) => r.id === checkId);
  return row === undefined ? NO_IDS : new Set(row.ids);
}

function blockedText(objectId: string, blocked: readonly string[]): string {
  return `${objectId} is locked: ${blocked.join(", ")}`;
}

/** The editor's state container: immutable states, one subscriber list, no DOM. */
export class EditorStore {
  private state: EditorState = INITIAL;
  private readonly listeners = new Set<Listener>();

  get(): EditorState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<EditorState>): void {
    const previous = this.state;
    const next = { ...previous, ...patch };
    if ((Object.keys(patch) as (keyof EditorState)[]).every((k) => previous[k] === next[k])) return;
    this.state = next;
    for (const listener of [...this.listeners]) listener(next, previous);
  }

  /** Results for `scene`, reusing what is known about the scene they were computed for. */
  private resultsFor(scene: Scene): Pick<EditorState, "results" | "resultsScene" | "highlightIds"> {
    const { resultsScene, results, highlightCheck } = this.state;
    const update =
      resultsScene === null ? { results: runChecks(scene) } : updateResults(resultsScene, scene, results);
    const highlightIds = update.results === results ? this.state.highlightIds : idsOf(update.results, highlightCheck);
    return { results: update.results, resultsScene: scene, highlightIds };
  }

  open(scene: Scene, fileName: string | null): void {
    const results = runChecks(scene);
    const { overlays, snap, mode, opened } = this.state;
    this.state = { ...INITIAL, overlays, snap, mode, opened };
    this.set({
      opened: opened + 1,
      fileName,
      history: startHistory(scene),
      saved: scene,
      results,
      resultsScene: scene,
    });
  }

  select(id: string | null): void {
    this.set({ selected: id });
  }

  highlightCheck(checkId: string | null): void {
    const next = checkId === this.state.highlightCheck ? null : checkId;
    this.set({ highlightCheck: next, highlightIds: idsOf(this.state.results, next) });
  }

  setOverlay(name: OverlayName, on: boolean): void {
    this.set({ overlays: { ...this.state.overlays, [name]: on } });
  }

  setSnap(step: number): void {
    this.set({ snap: step });
  }

  setMode(mode: ViewMode): void {
    this.set({ mode });
  }

  /** Show a message, or clear it with `null`. */
  notify(text: string | null, kind: Notice["kind"] = "info"): void {
    this.set({ notice: text === null ? null : { kind, text } });
  }

  /** Preview a scene while a drag is going on. The history does not change. */
  setLive(scene: Scene): void {
    if (this.state.history === null) return;
    this.set({ live: scene, ...this.resultsFor(scene) });
  }

  /** Drop the preview and go back to the scene in the history. */
  cancelLive(): void {
    const { history, live } = this.state;
    if (history === null || live === null) return;
    this.set({ live: null, ...this.resultsFor(history.present) });
  }

  /** Make the preview the present scene: one history step for the whole drag. */
  commitLive(): void {
    const { history, live } = this.state;
    if (history === null || live === null) return;
    this.set({ history: commit(history, live), live: null });
  }

  /** Apply the result of an edit as one history step. A blocked edit shows its reason. */
  edit(result: EditResult, objectId: string | null): void {
    const { history } = this.state;
    if (history === null) return;
    if (result.blocked.length > 0) {
      this.set({ notice: { kind: "error", text: blockedText(objectId ?? "scene", result.blocked) } });
      if (result.scene === history.present) return;
    }
    if (result.scene === history.present) return;
    this.set({ history: commit(history, result.scene), live: null, notice: null, ...this.resultsFor(result.scene) });
  }

  setLock(objectId: string, path: string, locked: boolean): void {
    const scene = currentScene(this.state);
    if (scene === null) return;
    this.edit({ scene: setLock(scene, objectId, path, locked), blocked: [] }, objectId);
  }

  undo(): void {
    this.move(undo);
  }

  redo(): void {
    this.move(redo);
  }

  private move(step: (h: History<Scene>) => History<Scene>): void {
    const { history, selected } = this.state;
    if (history === null || this.state.live !== null) return;
    const next = step(history);
    if (next === history) return;
    const keep = selected !== null && next.present.objects.some((o) => o.id === selected);
    this.set({ history: next, selected: keep ? selected : null, notice: null, ...this.resultsFor(next.present) });
  }

  markSaved(): void {
    const scene = currentScene(this.state);
    if (scene !== null) this.set({ saved: scene });
  }
}
