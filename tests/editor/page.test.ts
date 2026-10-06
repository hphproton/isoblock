import { readFileSync } from "node:fs";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { project } from "../../src/core/projection";
import { serializeScene } from "../../src/core/serialize";
import { toCanvas, type Viewport } from "../../src/core/viewport";
import { parseScene } from "../../src/core/validate";
import {
  checkRows,
  editorUrl,
  ev,
  frames,
  hasBrowser,
  launch,
  openEditor,
  sceneFile,
  sceneOf,
  type View,
} from "../helpers/browser";
import { fixtureNames, loadExpected, loadScene, readFixtureText, repoRoot } from "../helpers/fixtures";
import { makeScene } from "../helpers/scene";
import { join } from "node:path";

let browser: Browser;

beforeAll(async () => {
  if (hasBrowser) browser = await launch();
});

afterAll(async () => {
  await browser?.close();
});

/** RGBA of one canvas pixel at a canvas position in CSS pixels. */
async function pixel(page: Parameters<typeof ev>[0], view: View, at: readonly [number, number]): Promise<number[]> {
  return ev<number[]>(
    page,
    `(() => {
      const c = document.querySelector('figure.view[data-view="${view}"] canvas');
      const r = c.width / c.getBoundingClientRect().width;
      return Array.from(c.getContext('2d').getImageData(Math.round(${at[0]} * r), Math.round(${at[1]} * r), 1, 1).data);
    })()`,
  );
}

async function groundPixel(page: Parameters<typeof ev>[0], view: View, ground: readonly [number, number, number], scene = loadScene("yard")) {
  const viewport = await ev<Viewport>(page, `window.isoblock.viewport(${JSON.stringify(view)})`);
  const at = toCanvas(viewport, project(scene.camera, ground[0], ground[1], ground[2]));
  return pixel(page, view, at);
}

describe.skipIf(!hasBrowser)("editor page", () => {
  it("is one self-contained file that makes no other request", async () => {
    const html = readFileSync(join(repoRoot, "dist", "editor.html"), "utf8");
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<script[^>]*\bsrc=/i);
    expect(html).not.toMatch(/(?:src|href)=["']https?:/i);
    const context = await browser.newContext();
    const page = await context.newPage();
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto(editorUrl);
    await page.waitForFunction("window.isoblock !== undefined");
    expect(requests).toEqual([editorUrl]);
    await context.close();
  });

  it("starts empty, with Open available and Save, Undo and Redo disabled", async () => {
    const { page, context, errors } = await openEditor(browser, null);
    expect(await page.locator("#empty").isVisible()).toBe(true);
    expect(await page.locator("#save").isDisabled()).toBe(true);
    expect(await page.locator("#undo").isDisabled()).toBe(true);
    expect(await page.locator("#redo").isDisabled()).toBe(true);
    expect(await page.locator("#open").isEnabled()).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  });

  for (const name of fixtureNames()) {
    it(`opens ${name} and lists the same check results as the command line`, async () => {
      const { page, context, errors } = await openEditor(browser, name);
      const expected = loadExpected(name).results;
      const rows = (await checkRows(page)).map((r) => [r[0], r[1]]);
      expect(rows).toEqual(expected.map((r) => [r.id, r.status]));
      expect((await sceneOf(page)).id).toBe(loadScene(name).id);
      expect(await page.locator("#file-name").textContent()).toBe(`${name}.scene.json`);
      expect(errors).toEqual([]);
      await context.close();
    });
  }

  it("draws both views once the scene is open", async () => {
    const { page, context } = await openEditor(browser, "yard");
    for (const view of ["iso", "plan"] as const) {
      const box = await page.locator(`figure.view[data-view="${view}"] canvas`).boundingBox();
      expect(box!.width).toBeGreaterThan(100);
      const data = await ev<number>(
        page,
        `(() => { const c = document.querySelector('figure.view[data-view="${view}"] canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const seen = new Set(); for (let i = 0; i < d.length; i += 4 * 97) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return seen.size; })()`,
      );
      expect(data).toBeGreaterThan(4);
    }
    await context.close();
  });

  it("shows only one view in the Iso and Plan modes", async () => {
    const { page, context } = await openEditor(browser, "yard");
    await page.click('button[data-mode="iso"]');
    expect(await page.locator('figure.view[data-view="iso"]').isVisible()).toBe(true);
    expect(await page.locator('figure.view[data-view="plan"]').isVisible()).toBe(false);
    await page.click('button[data-mode="plan"]');
    expect(await page.locator('figure.view[data-view="plan"]').isVisible()).toBe(true);
    await frames(page, 3);
    const box = await page.locator('figure.view[data-view="plan"] canvas').boundingBox();
    expect(box!.width).toBeGreaterThan(300);
    await context.close();
  });

  it("redraws only when something changes", async () => {
    const { page, context } = await openEditor(browser, "yard");
    await frames(page, 5);
    const draws = () => ev<number>(page, "window.isoblock.frames.snapshot().draws");
    const before = await draws();
    await page.waitForTimeout(600);
    expect(await draws()).toBe(before);
    await page.check('input[data-overlay="anchors"]');
    await frames(page, 3);
    expect(await draws()).toBeGreaterThan(before);
    const after = await draws();
    await page.waitForTimeout(400);
    expect(await draws()).toBe(after);
    await context.close();
  });

  it("opens a scene without objects, strips, lanes or checks", async () => {
    const scene = makeScene();
    const { page, context, errors } = await openEditor(browser, sceneFile("empty.scene.json", scene));
    expect(await page.locator("#checks-list").textContent()).toContain("no checks");
    expect(await page.textContent("#props-body")).toContain("Select an object");
    for (const view of ["iso", "plan"] as const) {
      const box = await page.locator(`figure.view[data-view="${view}"] canvas`).boundingBox();
      expect(box!.width).toBeGreaterThan(100);
    }
    await page.click("#save");
    expect(errors).toEqual([]);
    await context.close();
  });

  it("rejects a file that is not valid and keeps the scene that was open", async () => {
    const { page, context } = await openEditor(browser, "yard");
    await page.setInputFiles("#file", { name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{ nope") });
    await page.waitForFunction("document.querySelector('#status').textContent.includes('E_JSON_PARSE')");
    expect(await page.locator("#status.error").count()).toBe(1);
    await page.setInputFiles("#file", { name: "bad2.json", mimeType: "application/json", buffer: Buffer.from('{"schema":"x"}') });
    await page.waitForFunction("document.querySelector('#status').textContent.includes('E_SCHEMA')");
    expect((await sceneOf(page)).id).toBe("yard");
    expect(await page.locator("#file-name").textContent()).toBe("yard.scene.json");
    await context.close();
  });

  it("reports an unresolved reference with its code", async () => {
    const broken = { ...loadScene("yard"), objects: [{ id: "x", type: "ghost", pos: [0, 0] }] };
    const { page, context } = await openEditor(browser, null);
    await page.setInputFiles("#file", sceneFile("broken.json", broken));
    await page.waitForFunction("document.querySelector('#status').textContent.includes('E_REF')");
    expect(await page.locator("#empty").isVisible()).toBe(true);
    await context.close();
  });
});

describe.skipIf(!hasBrowser)("editor: save", () => {
  async function save(page: Parameters<typeof ev>[0]): Promise<Buffer> {
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#save")]);
    const path = await download.path();
    return readFileSync(path);
  }

  for (const name of fixtureNames()) {
    it(`saves ${name} with the same data, and saving twice gives identical bytes`, async () => {
      const { page, context } = await openEditor(browser, name);
      const first = await save(page);
      const second = await save(page);
      expect(first.equals(second)).toBe(true);
      expect(JSON.parse(first.toString("utf8"))).toEqual(JSON.parse(readFixtureText(name)));
      expect(first.toString("utf8")).toBe(serializeScene(parseScene(readFixtureText(name))));
      await context.close();
    });
  }

  it("keeps the file name, and a saved file opens and saves to the same bytes", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#save")]);
    expect(download.suggestedFilename()).toBe("crowd.scene.json");
    const bytes = readFileSync(await download.path());
    await page.setInputFiles("#file", { name: "again.scene.json", mimeType: "application/json", buffer: bytes });
    await page.waitForFunction("window.isoblock.state().fileName === 'again.scene.json'");
    expect((await save(page)).equals(bytes)).toBe(true);
    await context.close();
  });

  it("does not touch the file system or browser storage", async () => {
    const { page, context } = await openEditor(browser, "yard");
    const used = await ev<number>(page, "localStorage.length + sessionStorage.length");
    expect(used).toBe(0);
    await context.close();
  });
});

describe.skipIf(!hasBrowser)("editor: overlays", () => {
  async function toggle(page: Parameters<typeof ev>[0], name: string, on: boolean): Promise<void> {
    await page.setChecked(`input[data-overlay="${name}"]`, on);
    await frames(page, 3);
  }

  it("lists frame regions, strips, lanes, zones and anchors as toggles", async () => {
    const { page, context } = await openEditor(browser, "yard");
    const names = await ev<string[]>(page, "Array.from(document.querySelectorAll('input[data-overlay]')).map((n) => n.dataset.overlay)");
    expect(names).toEqual(expect.arrayContaining(["regions", "strips", "lanes", "zones", "anchors"]));
    await context.close();
  });

  it("shows and hides strips", async () => {
    const { page, context } = await openEditor(browser, "yard");
    const floor = [10, 1, 0] as const;
    const on = await groundPixel(page, "iso", floor);
    expect(on.slice(0, 3)).toEqual([0xd5, 0xe8, 0xd0]);
    await toggle(page, "strips", false);
    expect((await groundPixel(page, "iso", floor)).slice(0, 3)).toEqual([0xfb, 0xfa, 0xf6]);
    await toggle(page, "strips", true);
    expect(await groundPixel(page, "iso", floor)).toEqual(on);
    await context.close();
  });

  it("shows and hides lanes", async () => {
    const { page, context } = await openEditor(browser, "yard");
    const haul = [10, 4.6, 0] as const;
    const on = await groundPixel(page, "iso", haul);
    await toggle(page, "lanes", false);
    const off = await groundPixel(page, "iso", haul);
    expect(off).not.toEqual(on);
    expect(off.slice(0, 3)).toEqual([0xfb, 0xfa, 0xf6]);
    await toggle(page, "lanes", true);
    expect(await groundPixel(page, "iso", haul)).toEqual(on);
    await context.close();
  });

  it("shows and hides frame regions", async () => {
    const { page, context } = await openEditor(browser, "yard");
    const viewport = await ev<Viewport>(page, 'window.isoblock.viewport("iso")');
    const hud = toCanvas(viewport, [500, 75]);
    const on = await pixel(page, "iso", hud);
    await toggle(page, "regions", false);
    const off = await pixel(page, "iso", hud);
    expect(off).not.toEqual(on);
    await toggle(page, "regions", true);
    expect(await pixel(page, "iso", hud)).toEqual(on);
    await context.close();
  });

  it("shows and hides anchors, which are off by default", async () => {
    const { page, context } = await openEditor(browser, "yard");
    const seat = [3.4 + 0.3, 2.6 + 0.2, 0.5] as const;
    const off = await groundPixel(page, "iso", seat);
    expect(await page.isChecked('input[data-overlay="anchors"]')).toBe(false);
    await toggle(page, "anchors", true);
    const on = await groundPixel(page, "iso", seat);
    expect(on).not.toEqual(off);
    await toggle(page, "anchors", false);
    expect(await groundPixel(page, "iso", seat)).toEqual(off);
    await context.close();
  });

  it("shows and hides zones, in both views", async () => {
    const scene = makeScene({
      zones: [{ id: "z", kind: "walkable", points: [[0, 0], [3, 0], [3, 3], [0, 3]] }],
      objects: [{ id: "a", type: "box", pos: [8, 8] }],
    });
    const { page, context } = await openEditor(browser, sceneFile("zones.scene.json", scene));
    const inside = [1.5, 1.5, 0] as const;
    const on = await groundPixel(page, "iso", inside, scene);
    await toggle(page, "zones", false);
    expect(await groundPixel(page, "iso", inside, scene)).not.toEqual(on);
    await toggle(page, "zones", true);
    expect(await groundPixel(page, "iso", inside, scene)).toEqual(on);
    await context.close();
  });
});
