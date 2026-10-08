import { describe, expect, it, vi } from "vitest";
import { runChecks } from "../../src/core/checks";
import { moveObject, setRotation } from "../../src/core/edit";
import { currentScene, EditorStore, isDirty, canUndoState, canRedoState } from "../../src/editor/store";
import { loadScene } from "../helpers/fixtures";
import { loadSortScene } from "../helpers/sort";
import { loadWalk } from "../helpers/states";

const overlap = loadScene("overlap");
const crowd = loadScene("crowd");

function opened(scene = overlap): EditorStore {
  const store = new EditorStore();
  store.open(scene, "scene.json");
  return store;
}

describe("EditorStore: open", () => {
  it("starts empty", () => {
    const state = new EditorStore().get();
    expect(currentScene(state)).toBeNull();
    expect(isDirty(state)).toBe(false);
  });

  it("opens a scene with a full check run, nothing selected, and nothing to undo", () => {
    const state = opened().get();
    expect(currentScene(state)).toBe(overlap);
    expect(state.fileName).toBe("scene.json");
    expect(state.results).toEqual(runChecks(overlap));
    expect(state.selected).toBeNull();
    expect(canUndoState(state)).toBe(false);
    expect(isDirty(state)).toBe(false);
  });

  it("counts the files that were opened", () => {
    const store = new EditorStore();
    expect(store.get().opened).toBe(0);
    store.open(overlap, "a.json");
    store.open(crowd, "b.json");
    expect(store.get().opened).toBe(2);
  });

  it("replaces the previous scene, its history and its selection", () => {
    const store = opened();
    store.select("a");
    store.edit(moveObject(overlap, overlap.objects[0]!.id, [9, 9]), overlap.objects[0]!.id);
    store.open(crowd, "crowd.scene.json");
    const state = store.get();
    expect(currentScene(state)).toBe(crowd);
    expect(state.selected).toBeNull();
    expect(canUndoState(state)).toBe(false);
    expect(state.notice).toBeNull();
  });
});

describe("EditorStore: editing", () => {
  const id = crowd.objects[100]!.id;

  it("previews a live scene without touching the history, then commits it as one step", () => {
    const store = opened(crowd);
    const moved = moveObject(crowd, id, [3.5, 3.5]).scene;
    store.setLive(moved);
    expect(currentScene(store.get())).toBe(moved);
    expect(canUndoState(store.get())).toBe(false);
    store.commitLive();
    expect(canUndoState(store.get())).toBe(true);
    expect(isDirty(store.get())).toBe(true);
    store.undo();
    expect(currentScene(store.get())).toBe(crowd);
    expect(isDirty(store.get())).toBe(false);
    store.redo();
    expect(currentScene(store.get())).toBe(moved);
    expect(canRedoState(store.get())).toBe(false);
  });

  it("keeps the results equal to a full run after every step", () => {
    const store = opened(crowd);
    const first = moveObject(crowd, id, [3.5, 3.5]).scene;
    store.setLive(first);
    expect(store.get().results).toEqual(runChecks(first));
    const second = moveObject(first, id, [4.5, 3.5]).scene;
    store.setLive(second);
    store.commitLive();
    expect(store.get().results).toEqual(runChecks(second));
    store.undo();
    expect(store.get().results).toEqual(runChecks(crowd));
  });

  it("drops a live preview on cancel", () => {
    const store = opened(crowd);
    store.setLive(moveObject(crowd, id, [3.5, 3.5]).scene);
    store.cancelLive();
    expect(currentScene(store.get())).toBe(crowd);
    expect(store.get().results).toEqual(runChecks(crowd));
    expect(canUndoState(store.get())).toBe(false);
  });

  it("commits nothing when the live scene equals the start", () => {
    const store = opened(crowd);
    store.setLive(crowd);
    store.commitLive();
    expect(canUndoState(store.get())).toBe(false);
  });

  it("applies an edit as one undoable step", () => {
    const store = opened(crowd);
    store.edit(setRotation(crowd, id, 180), id);
    expect(canUndoState(store.get())).toBe(true);
    expect(store.get().notice).toBeNull();
  });

  it("reports a blocked edit and leaves the scene and history alone", () => {
    const store = opened(crowd);
    store.edit(moveObject(crowd, "o010", [0, 0]), "o010");
    const state = store.get();
    expect(currentScene(state)).toBe(crowd);
    expect(canUndoState(state)).toBe(false);
    expect(state.notice).toEqual({ kind: "error", text: expect.stringContaining("pos") });
  });

  it("toggles a lock as an undoable step", () => {
    const store = opened(crowd);
    store.setLock(id, "pos", true);
    expect(currentScene(store.get())!.objects.find((o) => o.id === id)!.locks).toEqual(["pos"]);
    store.undo();
    expect(currentScene(store.get())).toBe(crowd);
  });

  it("keeps the selection through undo when the object still exists", () => {
    const store = opened(crowd);
    store.select(id);
    store.edit(setRotation(crowd, id, 180), id);
    store.undo();
    expect(store.get().selected).toBe(id);
  });

  it("marks the scene as saved", () => {
    const store = opened(crowd);
    store.edit(setRotation(crowd, id, 180), id);
    expect(isDirty(store.get())).toBe(true);
    store.markSaved();
    expect(isDirty(store.get())).toBe(false);
    store.undo();
    expect(isDirty(store.get())).toBe(true);
  });
});

describe("EditorStore: view state", () => {
  it("highlights the objects of a check row and clears on a second tap", () => {
    const store = opened(overlap);
    const failing = store.get().results.find((r) => r.ids.length > 0)!;
    store.highlightCheck(failing.id);
    expect([...store.get().highlightIds]).toEqual(failing.ids);
    expect(store.get().highlightCheck).toBe(failing.id);
    store.highlightCheck(failing.id);
    expect(store.get().highlightIds.size).toBe(0);
    expect(store.get().highlightCheck).toBeNull();
  });

  it("follows the ids of the highlighted check when its result changes", () => {
    const store = opened(crowd);
    store.highlightCheck("c3");
    expect(store.get().highlightIds.has("o199")).toBe(true);
    store.edit(moveObject(crowd, "o199", [50, 50]), "o199");
    expect(store.get().highlightIds.has("o199")).toBe(false);
  });

  it("toggles overlays, with the ground layers on and anchors off by default", () => {
    const store = opened();
    expect(store.get().overlays).toEqual({ regions: true, strips: true, lanes: true, zones: true, anchors: false, labels: false });
    store.setOverlay("anchors", true);
    expect(store.get().overlays.anchors).toBe(true);
  });

  it("sets the snap step and the view mode", () => {
    const store = opened();
    store.setSnap(0.25);
    store.setMode("plan");
    expect(store.get().snap).toBe(0.25);
    expect(store.get().mode).toBe("plan");
  });

  it("shows a notice and clears it", () => {
    const store = opened();
    store.notify("hello", "info");
    expect(store.get().notice).toEqual({ kind: "info", text: "hello" });
    store.notify(null);
    expect(store.get().notice).toBeNull();
  });

  it("calls subscribers with the new and the previous state, until unsubscribed", () => {
    const store = opened();
    const seen = vi.fn();
    const off = store.subscribe(seen);
    store.select("a");
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]![0].selected).toBe("a");
    expect(seen.mock.calls[0]![1].selected).toBeNull();
    off();
    store.select(null);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("does not notify when nothing changes", () => {
    const store = opened();
    const seen = vi.fn();
    store.subscribe(seen);
    store.select(null);
    store.setSnap(store.get().snap);
    expect(seen).not.toHaveBeenCalled();
  });
});

describe("EditorStore: grid checks wait for the end of a drag (SPEC 10)", () => {
  const walk = loadWalk();
  const reachable = ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8"];
  // Moving barrier1 out of the gap in the lawn opens a path: k2 goes from fail to pass.
  const first = moveObject(walk, "barrier1", [5, 7.2]).scene;
  const second = moveObject(first, "barrier1", [5, 7.5]).scene;

  it("keeps the result of every grid check during a drag and marks it out of date; the other checks run", () => {
    const store = opened(walk);
    const before = store.get().results;
    store.setLive(first);
    const state = store.get();
    expect([...state.stale]).toEqual(reachable);
    const fresh = runChecks(first);
    state.results.forEach((r, i) => {
      if (reachable.includes(r.id)) expect(r).toBe(before[i]);
      else expect(r).toEqual(fresh[i]);
    });
    const stale = state.stale;
    store.setLive(second);
    expect(store.get().stale).toBe(stale);
    expect(store.get().results.find((r) => r.id === "k2")?.status).toBe("fail");
  });

  it("runs the grid checks again when the drag ends, so the results equal a full run", () => {
    const store = opened(walk);
    store.setLive(first);
    store.setLive(second);
    store.commitLive();
    expect(store.get().stale.size).toBe(0);
    expect(store.get().results).toEqual(runChecks(second));
    expect(store.get().results.find((r) => r.id === "k2")?.status).toBe("pass");
  });

  it("runs them again when a drag is cancelled, for the scene before the drag", () => {
    const store = opened(walk);
    store.setLive(second);
    store.cancelLive();
    expect(store.get().stale.size).toBe(0);
    expect(store.get().results).toEqual(runChecks(walk));
  });

  it("runs every involved check at once for other edits, undo and redo", () => {
    const store = opened(walk);
    store.edit(moveObject(walk, "barrier1", [5, 7.5]), "barrier1");
    expect(store.get().stale.size).toBe(0);
    expect(store.get().results).toEqual(runChecks(second));
    store.undo();
    expect(store.get().results).toEqual(runChecks(walk));
    store.redo();
    expect(store.get().results).toEqual(runChecks(second));
    expect(store.get().stale.size).toBe(0);
  });

  it("defers every sort_consistency check of court during a drag", () => {
    const court = loadSortScene({ scene: "tests/fixtures/sort/court.scene.json" });
    const store = opened(court);
    const moved = moveObject(court, "crate", [4.4, 3.9]).scene;
    store.setLive(moved);
    expect([...store.get().stale]).toEqual(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"]);
    store.commitLive();
    expect(store.get().stale.size).toBe(0);
    expect(store.get().results).toEqual(runChecks(moved));
  });

  it("opens a scene with nothing out of date", () => {
    const store = opened(walk);
    store.setLive(first);
    store.open(walk, "walk.scene.json");
    expect(store.get().stale.size).toBe(0);
    expect(store.get().results).toEqual(runChecks(walk));
  });
});
