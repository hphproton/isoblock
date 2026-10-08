import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import { searchesGrid } from "../../src/core/incremental";
import type { CheckResult, Scene } from "../../src/core/types";
import { ev, frames, hasBrowser, launch, openEditor, sceneFile, sceneOf, screenOf } from "../helpers/browser";
import { repoRoot } from "../helpers/fixtures";
import { sortScenePath } from "../helpers/sort";
import { walkScenePath } from "../helpers/states";

let browser: Browser;

beforeAll(async () => {
  if (hasBrowser) browser = await launch();
});

afterAll(async () => {
  await browser?.close();
});

type PanelRow = readonly [id: string, status: string, message: string, stale: string];

/** The rows of the check panel: id, status, message and whether the row is marked out of date. */
function panelRows(page: Page): Promise<PanelRow[]> {
  return ev<PanelRow[]>(
    page,
    "Array.from(document.querySelectorAll('#checks-list button.check')).map((n) => [n.dataset.check, n.dataset.status, n.querySelector('.message').textContent, n.dataset.stale ?? 'false'])",
  );
}

/** `isoblock check --json` on a scene file, through the built CLI. */
function checkJson(text: string): readonly CheckResult[] {
  const dir = mkdtempSync(join(tmpdir(), "isoblock-grid-"));
  try {
    const file = join(dir, "saved.scene.json");
    writeFileSync(file, text);
    const r = spawnSync(process.execPath, [join(repoRoot, "dist", "isoblock.mjs"), "check", "--json", file], { encoding: "utf8" });
    expect([0, 1]).toContain(r.status);
    return (JSON.parse(r.stdout) as { results: CheckResult[] }).results;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const cases = [
  { name: "walk", path: walkScenePath(), object: "barrier1", offset: [0, 60] },
  { name: "court", path: sortScenePath({ scene: "tests/fixtures/sort/court.scene.json" }), object: "crate", offset: [25, 20] },
] as const;

describe.skipIf(!hasBrowser)("editor: checks that search a grid run again when a drag ends (SPEC 10, stage 8)", () => {
  for (const c of cases) {
    it(`${c.name}: during a drag their rows keep the last result and are out of date; after the drop the panel equals check --json on the saved file`, async () => {
      const text = readFileSync(c.path, "utf8");
      const { page, context, errors } = await openEditor(browser, sceneFile(`${c.name}.scene.json`, JSON.parse(text)));
      const opened = (await sceneOf(page)) as Scene;
      const grid = (opened.checks ?? []).filter(searchesGrid).map((s) => s.id);
      expect(grid.length).toBeGreaterThan(0);
      const before = await panelRows(page);
      expect(before.map((r) => r[3])).toEqual(before.map(() => "false"));

      const from = await screenOf(page, "plan", c.object);
      await page.mouse.move(from[0], from[1]);
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) {
        await page.mouse.move(from[0] + (c.offset[0] * i) / 6, from[1] + (c.offset[1] * i) / 6);
        await frames(page, 1);
      }
      await frames(page, 2);
      const live = (await sceneOf(page)) as Scene;
      expect(live.objects.find((o) => o.id === c.object)?.pos).not.toEqual(opened.objects.find((o) => o.id === c.object)?.pos);
      expect(await ev<string[]>(page, "window.isoblock.state().stale")).toEqual(grid);
      const during = await panelRows(page);
      const fresh = runChecks(live);
      during.forEach((row, i) => {
        if (grid.includes(row[0])) {
          expect(row, `${row[0]} keeps its last result`).toEqual([...(before[i] as PanelRow).slice(0, 3), "true"]);
        } else {
          expect(row, `${row[0]} runs live`).toEqual([fresh[i]?.id, fresh[i]?.status, fresh[i]?.message, "false"]);
        }
      });
      const staleText = await ev<string>(page, "getComputedStyle(document.querySelector('#checks-list button.check[data-stale=\"true\"] .stale')).display");
      expect(staleText).toBe("block");

      await page.mouse.up();
      await frames(page, 2);
      expect(await ev<string[]>(page, "window.isoblock.state().stale")).toEqual([]);
      const [download] = await Promise.all([page.waitForEvent("download"), page.click("#save")]);
      const saved = readFileSync(await download.path(), "utf8");
      const results = checkJson(saved);
      expect(await panelRows(page)).toEqual(results.map((r) => [r.id, r.status, r.message, "false"]));
      expect(results).toEqual(runChecks((await sceneOf(page)) as Scene));
      expect(errors).toEqual([]);
      await context.close();
    });
  }
});
