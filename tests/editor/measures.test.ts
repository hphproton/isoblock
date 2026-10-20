import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import type { CheckResult, Scene } from "../../src/core/types";
import { ev, hasBrowser, launch, openEditor, sceneOf } from "../helpers/browser";
import { repoRoot } from "../helpers/fixtures";

let browser: Browser;

beforeAll(async () => {
  if (hasBrowser) browser = await launch();
});

afterAll(async () => {
  await browser?.close();
});

type PanelRow = readonly [id: string, status: string, message: string];

function panelRows(page: Page): Promise<PanelRow[]> {
  return ev<PanelRow[]>(
    page,
    "Array.from(document.querySelectorAll('#checks-list button.check')).map((n) => [n.dataset.check, n.dataset.status, n.querySelector('.message').textContent])",
  );
}

function checkJson(text: string): readonly CheckResult[] {
  const dir = mkdtempSync(join(tmpdir(), "isoblock-measures-"));
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

describe.skipIf(!hasBrowser)("editor: the check panel shows the stage 9 measures", () => {
  it("lists drawn regions, heights and lane_apart, and equals check --json on the saved file", async () => {
    const { page, context, errors } = await openEditor(browser, "measures/measures");
    const scene = (await sceneOf(page)) as Scene;
    const fresh = runChecks(scene);
    expect(fresh.map((r) => r.check)).toEqual(expect.arrayContaining(["in_region", "min_screen_size", "lane_apart"]));
    expect(await panelRows(page)).toEqual(fresh.map((r) => [r.id, r.status, r.message]));

    await page.click('#checks-list button.check[data-check="drawn"]');
    expect(await ev<string[]>(page, "window.isoblock.state().highlight")).toEqual(["tower"]);
    await page.click('#checks-list button.check[data-check="walks_near"]');
    expect(await ev<string[]>(page, "window.isoblock.state().highlight")).toEqual(["walk1", "walk2"]);

    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#save")]);
    const saved = readFileSync(await download.path(), "utf8");
    const results = checkJson(saved);
    expect(await panelRows(page)).toEqual(results.map((r) => [r.id, r.status, r.message]));
    expect(results).toEqual(fresh);
    expect(results.find((r) => r.id === "drawn")?.outside).toEqual([0.137931]);
    expect(results.find((r) => r.id === "walks_cross")?.overlap).toBe(0.6);
    expect(errors).toEqual([]);
    await context.close();
  });
});
