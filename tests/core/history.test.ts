import { describe, expect, it } from "vitest";
import { canRedo, canUndo, commit, redo, startHistory, undo } from "../../src/core/history";

describe("history", () => {
  it("starts with nothing to undo or redo", () => {
    const h = startHistory("a");
    expect(h.present).toBe("a");
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it("commits, undoes and redoes", () => {
    let h = startHistory("a");
    h = commit(h, "b");
    h = commit(h, "c");
    expect([h.present, canUndo(h), canRedo(h)]).toEqual(["c", true, false]);
    h = undo(h);
    expect([h.present, canRedo(h)]).toEqual(["b", true]);
    h = undo(h);
    expect(h.present).toBe("a");
    expect(canUndo(h)).toBe(false);
    h = redo(redo(h));
    expect(h.present).toBe("c");
  });

  it("ignores a commit of the value that is already present", () => {
    const h = startHistory("a");
    expect(commit(h, "a")).toBe(h);
  });

  it("drops the redo list on a new commit", () => {
    let h = commit(commit(startHistory("a"), "b"), "c");
    h = commit(undo(h), "d");
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe("b");
  });

  it("returns the same history when there is nothing to undo or redo", () => {
    const h = startHistory("a");
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("keeps at most `limit` steps, dropping the oldest", () => {
    let h = startHistory(0);
    for (let i = 1; i <= 5; i++) h = commit(h, i, 3);
    expect(h.past).toEqual([2, 3, 4]);
    expect(h.present).toBe(5);
  });
});
