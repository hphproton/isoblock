import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { footprint } from "../../src/core/geometry";
import { shortAssumptionPath } from "../../src/core/describe";
import { planCamera } from "../../src/core/planView";
import { project } from "../../src/core/projection";
import { toCanvas, type Viewport } from "../../src/core/viewport";
import {
  canvasBox,
  ev,
  frames,
  hasBrowser,
  launch,
  openEditor,
  sceneOf,
  type View,
} from "../helpers/browser";
import { repoRoot } from "../helpers/fixtures";
import { memoryIo } from "../helpers/cli";

interface Step {
  readonly select?: string;
  readonly key?: string;
  readonly press?: string;
  readonly type?: string;
  readonly state?: string;
  readonly toggle?: string;
  readonly settle?: string;
  readonly undo?: number;
  readonly field?: string;
  readonly value?: number;
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

function loadCases(path: string): EditorCase[] {
  return (JSON.parse(readFileSync(join(repoRoot, path), "utf8")) as { cases: EditorCase[] }).cases;
}

const cases = loadCases("tests/fixtures/editor/cases.json");
const levelCases = loadCases("tests/fixtures/levels/editor/cases.json");
const explainCases = loadCases("tests/fixtures/explain/editor/cases.json");

let browser: Browser;

beforeAll(async () => {
  if (hasBrowser) browser = await launch();
});

afterAll(async () => {
  await browser?.close();
});

function fixtureName(scene: string): string {
  return scene.replace(/^tests\/fixtures\//, "").replace(/\.scene\.json$/, "");
}

async function rows(page: Parameters<typeof ev>[0]): Promise<{ id: string; status: string; message: string }[]> {
  return ev(page, "Array.from(document.querySelectorAll('#checks-list button.check')).map((n) => ({ id: n.dataset.check, status: n.dataset.status, message: n.querySelector('.message').textContent }))");
}

/** Click the plan view where the object's footprint center is, whether or not it is drawn. */
async function clickFootprint(page: Parameters<typeof ev>[0], id: string): Promise<void> {
  const scene = await sceneOf(page);
  const object = scene.objects.find((item) => item.id === id);
  if (object === undefined) throw new Error(`missing object ${id}`);
  const box = footprint(scene, object);
  const point = project(planCamera(), (box.u0 + box.u1) / 2, (box.v0 + box.v1) / 2, 0);
  const viewport = await ev<Viewport>(page, 'window.isoblock.viewport("plan")');
  const [x, y] = toCanvas(viewport, point);
  const canvas = await canvasBox(page, "plan");
  await page.mouse.click(canvas.x + x, canvas.y + y);
  await frames(page, 1);
}

async function runSteps(page: Parameters<typeof ev>[0], steps: readonly Step[]): Promise<void> {
  for (const step of steps) {
    if (step.select !== undefined) {
      const at = await ev<readonly [number, number] | null>(page, `window.isoblock.screenOf("plan", ${JSON.stringify(step.select)})`);
      if (at === null) throw new Error(`${step.select} is not visible in the plan view`);
      await page.mouse.click(at[0], at[1]);
    } else if (step.key !== undefined) {
      await page.keyboard.press(step.key);
    } else if (step.press !== undefined) {
      if (step.type !== undefined) await page.locator("select[aria-label='Type to add']").selectOption(step.type);
      await page.getByRole("button", { name: step.press, exact: true }).click();
    } else if (step.state !== undefined) {
      await page.locator("select[aria-label='State']").selectOption(step.state);
    } else if (step.toggle !== undefined) {
      const root = step.toggle.startsWith("Region ") ? page.locator("#regions") : page.locator("#props");
      await root.getByRole("checkbox", { name: step.toggle, exact: true }).click();
    } else if (step.settle !== undefined) {
      const short = shortAssumptionPath(await sceneOf(page), step.settle);
      await page.getByRole("button", { name: `Settle ${short}`, exact: true }).click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
    } else if (step.undo !== undefined) {
      for (let i = 0; i < step.undo; i += 1) await page.getByRole("button", { name: "Undo", exact: true }).click();
    } else if (step.field !== undefined) {
      const input = page.locator(`[aria-label="${step.field}"]`);
      await input.fill(String(step.value));
      await input.press("Enter");
    }
    await frames(page, 2);
  }
}

function editorSuite(title: string, list: readonly EditorCase[], expectedDir: string): void {
  describe.skipIf(!hasBrowser)(title, () => {
    it(`finds the ${list.length} cases`, () => {
      expect(list.length).toBeGreaterThan(0);
    });

    for (const c of list) {
      it(`${c.name} follows the steps and saves the expected file`, async () => {
        const { page, context, errors } = await openEditor(browser, fixtureName(c.scene));
        expect(await page.locator('figure.view[data-view="plan"]').isVisible()).toBe(true);
        expect(await page.locator('figure.view[data-view="iso"]').isVisible()).toBe(true);
        await page.locator("#snap").selectOption(String(c.snap));
        const before = await ev<string>(page, "window.isoblock.text()");
        await runSteps(page, c.steps);
        if (c.refused) expect(((await page.locator("#status").textContent()) ?? "").trim(), c.name).not.toBe("");
        await page.click("#save");
        const saved = await ev<string>(page, "window.isoblock.text()");
        const want = c.expected === null ? before : readFileSync(join(expectedDir, c.expected), "utf8");
        expect(saved, c.name).toBe(want);
      expect(await page.locator("select[aria-label='State']").inputValue(), c.name).toBe(c.panelState ?? "default");
      const cap = memoryIo({ "scene.json": saved });
      const argv = ["check", "--json", "scene.json", ...(c.panelState === null ? [] : ["--state", c.panelState])];
      expect(run(argv, cap.io), c.name).not.toBe(2);
      const results = (JSON.parse(cap.out()) as { results: { id: string; status: string; message: string }[] }).results;
      expect(await rows(page), c.name).toEqual(results.map((result) => ({ id: result.id, status: result.status, message: result.message })));
      for (const id of c.hidden) {
        for (const view of ["plan", "iso"] as const satisfies readonly View[]) {
          expect(await ev(page, `window.isoblock.screenOf(${JSON.stringify(view)}, ${JSON.stringify(id)})`), `${id} ${view}`).toBeNull();
        }
        await clickFootprint(page, id);
        expect((await ev<{ selected: string | null }>(page, "window.isoblock.state()")).selected, id).not.toBe(id);
      }
        expect(errors, c.name).toEqual([]);
        await context.close();
      }, 60_000);
    }
  });
}

editorSuite("editor cases", cases, join(repoRoot, "tests", "fixtures", "editor"));
editorSuite("level editor cases", levelCases, join(repoRoot, "tests", "fixtures", "levels", "editor"));
editorSuite("explain editor cases", explainCases, join(repoRoot, "tests", "fixtures", "explain", "editor"));
