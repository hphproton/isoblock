import { runChecks } from "../core/checks";
import { resultsInState } from "../core/checks/liveState";
import type { EditResult } from "../core/edit";
import { canRedo, canUndo, commit, redo, startHistory, undo, type History } from "../core/history";
import { rerunResults, searchesGrid, updateResults } from "../core/incremental";
import { setLock } from "../core/locks";
import { runPatch } from "../core/patch/outcome";
import type { CheckResult, Scene } from "../core/types";
import { addLine, duplicateLine, nudgeLine } from "./edits";
import { activeStateName, keptSelection, shownStateName } from "./shown";

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
  /**
   * Ids of the checks whose result is out of date: grid checks keep their last result during a drag
   * and run again when it ends (SPEC 10).
   */
  readonly stale: ReadonlySet<string>;
  readonly selected: string | null;
  readonly highlightCheck: string | null;
  readonly highlightIds: ReadonlySet<string>;
  readonly overlays: Readonly<Record<OverlayName, boolean>>;
  readonly snap: number;
  /** Value of the State select. Switching it is not an edit. */
  readonly shownState: string;
  /** The state `results` belong to, or null when they were run with every object present. */
  readonly resultsState: string | null;
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
  stale: NO_IDS,
  selected: null,
  highlightCheck: null,
  highlightIds: NO_IDS,
  overlays: { regions: true, strips: true, lanes: true, zones: true, anchors: false, labels: false },
  snap: 0.1,
  shownState: "default",
  resultsState: null,
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

  /**
   * Results for `scene`, reusing what is known about the scene they were computed for. During a drag
   * the grid checks keep their result and become stale; otherwise stale checks run again.
   */
  private resultsFor(
    scene: Scene,
    dragging = false,
    shown = this.state.shownState,
  ): Pick<EditorState, "shownState" | "results" | "resultsScene" | "resultsState" | "highlightIds" | "stale"> {
    const shownState = shownStateName(scene, shown);
    const state = activeStateName(scene, shownState);
    const { resultsScene, results, highlightCheck, stale, resultsState } = this.state;
    if (state !== undefined) {
      const same = resultsState === state && resultsScene !== null;
      const update = resultsInState(same ? resultsScene : null, scene, state, same ? results : [], dragging, same ? stale : NO_IDS);
      return {
        shownState, results: update.results, resultsScene: scene, resultsState: state,
        highlightIds: idsOf(update.results, highlightCheck), stale: update.stale,
      };
    }
    if (resultsScene === null || resultsState !== null) {
      const fresh = runChecks(scene);
      return { shownState, results: fresh, resultsScene: scene, resultsState: null, highlightIds: idsOf(fresh, highlightCheck), stale: NO_IDS };
    }
    const update = updateResults(resultsScene, scene, results, dragging ? searchesGrid : undefined);
    let next = update.results;
    let nextStale = stale;
    if (dragging && update.deferred.some((id) => !stale.has(id))) nextStale = new Set([...stale, ...update.deferred]);
    if (!dragging && stale.size > 0) {
      const ran = new Set(update.rerun);
      next = rerunResults(scene, next, new Set([...stale].filter((id) => !ran.has(id))));
      nextStale = NO_IDS;
    }
    const highlightIds = next === results ? this.state.highlightIds : idsOf(next, highlightCheck);
    return { shownState, results: next, resultsScene: scene, resultsState: null, highlightIds, stale: nextStale };
  }

  open(scene: Scene, fileName: string | null): void {
    const { overlays, snap, mode, opened } = this.state;
    this.state = { ...INITIAL, overlays, snap, mode, opened };
    this.set({
      opened: opened + 1,
      fileName,
      history: startHistory(scene),
      saved: scene,
      ...this.resultsFor(scene),
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

  /** Show a state, or `default`. Not an edit: the file and the history stay as they are. */
  setShownState(name: string): void {
    const scene = currentScene(this.state);
    if (scene === null) return;
    const shown = shownStateName(scene, name);
    if (shown === this.state.shownState) return;
    this.set({
      selected: keptSelection(scene, shown, this.state.selected),
      ...this.resultsFor(scene, this.state.live !== null, shown),
    });
  }

  setMode(mode: ViewMode): void {
    this.set({ mode });
  }

  /** Show a message, or clear it with `null`. */
  notify(text: string | null, kind: Notice["kind"] = "info"): void {
    this.set({ notice: text === null ? null : { kind, text } });
  }

  /** Preview a scene while a drag is going on. The history does not change; grid checks wait for the end of the drag. */
  setLive(scene: Scene): void {
    if (this.state.history === null) return;
    this.set({ live: scene, ...this.resultsFor(scene, true) });
  }

  /** Drop the preview and go back to the scene in the history. */
  cancelLive(): void {
    const { history, live } = this.state;
    if (history === null || live === null) return;
    this.set({ live: null, ...this.resultsFor(history.present) });
  }

  /** Make the preview the present scene: one history step for the whole drag. The stale checks run again. */
  commitLive(): void {
    const { history, live } = this.state;
    if (history === null || live === null) return;
    this.set({ history: commit(history, live), live: null, ...this.resultsFor(live) });
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

  /**
   * Apply one short command as one history step. A command `patch` would reject leaves the scene
   * unchanged and shows the reason. `select` becomes the selection (`undefined` keeps it).
   */
  applyLine(line: string, select?: string | null): boolean {
    const scene = currentScene(this.state);
    const { history, live } = this.state;
    if (scene === null || history === null || live !== null) return false;
    const outcome = runPatch(scene, line.endsWith("\n") ? line : `${line}\n`);
    if (outcome.result === null) {
      const text = (outcome.error?.message ?? "the edit was refused").replace(/^line \d+: /, "");
      this.set({ notice: { kind: "error", text } });
      return false;
    }
    const shown = shownStateName(outcome.result, this.state.shownState);
    const wanted = select === undefined ? this.state.selected : select;
    this.set({
      history: commit(history, outcome.result),
      live: null,
      notice: null,
      selected: keptSelection(outcome.result, shown, wanted),
      ...this.resultsFor(outcome.result, false, shown),
    });
    return true;
  }

  /** Move the selection by the snap step, or by 1 when `shift` is set. One key press, one step. */
  nudge(key: string, shift: boolean): void {
    const scene = currentScene(this.state);
    const id = this.state.selected;
    if (scene === null || id === null) return;
    const line = nudgeLine(id, key, shift ? 1 : this.state.snap);
    if (line !== null) this.applyLine(line);
  }

  /** Append an object of `type` at the snapped center of the view and select it. */
  addObject(type: string): void {
    const scene = currentScene(this.state);
    if (scene === null || !Object.hasOwn(scene.types, type)) return;
    const added = addLine(scene, type, this.state.snap);
    this.applyLine(added.line, added.id);
  }

  /** Append a copy of the selection and select the copy. */
  duplicateSelected(): void {
    const scene = currentScene(this.state);
    const id = this.state.selected;
    if (scene === null || id === null) return;
    const copy = duplicateLine(scene, id);
    if (copy !== null) this.applyLine(copy.line, copy.id);
  }

  /** Remove the selection, as `remove`. */
  removeSelected(): void {
    const id = this.state.selected;
    if (id !== null) this.applyLine(`remove ${id}`, null);
  }

  /** Remove one assumption entry. The list stays, also when it becomes empty. A person's act. */
  settleAssumption(path: string): void {
    const scene = currentScene(this.state);
    const { history, live } = this.state;
    if (scene === null || history === null || live !== null || scene.assumptions === undefined) return;
    const index = scene.assumptions.findIndex((entry) => entry.path === path);
    if (index < 0) return;
    const result: Scene = { ...scene, assumptions: scene.assumptions.filter((_, i) => i !== index) };
    const shown = shownStateName(result, this.state.shownState);
    this.set({
      history: commit(history, result),
      live: null,
      notice: null,
      selected: keptSelection(result, shown, this.state.selected),
      ...this.resultsFor(result, false, shown),
    });
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
    const shown = shownStateName(next.present, this.state.shownState);
    this.set({
      history: next,
      notice: null,
      selected: keptSelection(next.present, shown, selected),
      ...this.resultsFor(next.present, false, shown),
    });
  }

  markSaved(): void {
    const scene = currentScene(this.state);
    if (scene !== null) this.set({ saved: scene });
  }
}
