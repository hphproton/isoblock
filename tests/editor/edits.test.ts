import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { runChecksInState } from "../../src/core/checks/inState";
import { serializeScene } from "../../src/core/serialize";
import { parseScene } from "../../src/core/validate";
import { currentScene, EditorStore } from "../../src/editor/store";
import { sceneShown } from "../../src/editor/shown";
import { repoRoot } from "../helpers/fixtures";

interface Step {
  readonly select?: string;
  readonly key?: string;
  readonly press?: string;
  readonly type?: string;
  readonly state?: string;
  readonly toggle?: string;
  readonly settle?: string;
  readonly undo?: number;
}

interface EditorCase {
  readonly name: string;
  readonly scene: string;
  readonly snap: number;
  readonly steps: readonly Step[];
  readonly expected: string | null;
  readonly refused: boolean;
  readonly panelState: string | null;
  readonly hidden: readonly string[];
}

const cases = (JSON.parse(readFileSync(join(repoRoot, "tests", "fixtures", "editor", "cases.json"), "utf8")) as { cases: EditorCase[] }).cases;
const ONE_STEP = new Set(["e04-add", "e05-duplicate", "e08-delete", "e12-hide", "e13-show", "e14-settle", "e16-hide-second-object"]);

function drive(store: EditorStore, steps: readonly Step[]): void {
  for (const step of steps) {
    if (step.select !== undefined) store.select(step.select);
    if (step.key === "Delete" || step.key === "Backspace") store.removeSelected();
    else if (step.key !== undefined) {
      const shift = step.key.startsWith("Shift+");
      store.nudge(shift ? step.key.slice("Shift+".length) : step.key, shift);
    }
    if (step.press === "Add") store.addObject(step.type ?? "");
    if (step.press === "Duplicate") store.duplicateSelected();
    if (step.press === "Delete") store.removeSelected();
    if (step.state !== undefined) store.setShownState(step.state);
    if (step.toggle !== undefined) {
      const name = step.toggle.replace(/^Hidden in /, "");
      const id = store.get().selected;
      const scene = currentScene(store.get());
      const hidden = id !== null && scene?.states?.[name]?.hide?.includes(id) === true;
      if (id !== null) store.applyLine(`${hidden ? "show" : "hide"} ${name} ${id}`);
    }
    if (step.settle !== undefined) store.settleAssumption(step.settle);
    if (step.undo !== undefined) for (let i = 0; i < step.undo; i += 1) store.undo();
  }
}

describe("editor cases through the store", () => {
  it("finds the 16 cases", () => {
    expect(cases).toHaveLength(16);
  });

  for (const c of cases) {
    it(`${c.name} matches its expected file, checks and hidden objects`, () => {
      const store = new EditorStore();
      store.open(parseScene(readFileSync(join(repoRoot, c.scene), "utf8")), "scene.json");
      store.setSnap(c.snap);
      const before = serializeScene(currentScene(store.get()) as NonNullable<ReturnType<typeof currentScene>>);
      drive(store, c.steps);
      const scene = currentScene(store.get()) as NonNullable<ReturnType<typeof currentScene>>;
      const saved = serializeScene(scene);
      const want = c.expected === null ? before : readFileSync(join(repoRoot, "tests", "fixtures", "editor", c.expected), "utf8");
      expect(saved, c.name).toBe(want);
      if (c.refused) expect(store.get().notice?.text ?? "", c.name).not.toBe("");
      expect(store.get().shownState, c.name).toBe(c.panelState ?? "default");
      const results = c.panelState === null ? runChecks(scene) : runChecksInState(scene, c.panelState);
      expect(store.get().results, c.name).toEqual(results);
      const drawn = sceneShown(scene, store.get().shownState);
      for (const id of c.hidden) {
        expect(drawn.objects.some((object) => object.id === id), id).toBe(false);
        expect(store.get().selected, id).not.toBe(id);
      }
      if (ONE_STEP.has(c.name)) {
        store.undo();
        expect(serializeScene(currentScene(store.get()) as NonNullable<ReturnType<typeof currentScene>>), c.name).toBe(before);
      }
    });
  }
});
