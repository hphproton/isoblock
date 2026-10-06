import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { groundDelta, snapValue } from "../../src/core/drag";
import { planCamera } from "../../src/core/planView";
import type { Scene, SceneObject, Vec2 } from "../../src/core/types";
import {
  displayPoint,
  dragMouse,
  ev,
  frames,
  hasBrowser,
  launch,
  openEditor,
  posOf,
  sceneOf,
  screenOf,
  type View,
} from "../helpers/browser";
import { loadScene } from "../helpers/fixtures";

let browser: Browser;
const crowd = loadScene("crowd");
const free = "o101";

beforeAll(async () => {
  if (hasBrowser) browser = await launch();
});

afterAll(async () => {
  await browser?.close();
});

const status = (page: Page) => ev<string>(page, "document.querySelector('#status').textContent");
const dirty = (page: Page) => page.locator("#file-name.dirty").count().then((n) => n > 0);

/** Where the object should end up when the pointer goes from `from` to `to` in a view. */
async function expected(page: Page, scene: Scene, view: View, id: string, from: Vec2, to: Vec2, step: number): Promise<Vec2> {
  const camera = view === "iso" ? scene.camera : planCamera();
  const object = scene.objects.find((o) => o.id === id) as SceneObject;
  const [du, dv] = groundDelta(camera, await displayPoint(page, view, from), await displayPoint(page, view, to));
  return [snapValue(object.pos[0] + du, step), snapValue(object.pos[1] + dv, step)];
}

describe.skipIf(!hasBrowser)("editor: dragging", () => {
  for (const view of ["iso", "plan"] as const) {
    it(`moves an object in the ${view} view by the ground distance the pointer covers, on the grid`, async () => {
      const { page, context, errors } = await openEditor(browser, "crowd");
      const scene = await sceneOf(page);
      const from = await screenOf(page, view, free);
      const to: Vec2 = [from[0] + 47, from[1] + 29];
      const want = await expected(page, scene, view, free, from, to, 0.1);
      await dragMouse(page, from, to);
      const pos = await posOf(page, free);
      expect(pos[0]).toBeCloseTo(want[0], 6);
      expect(pos[1]).toBeCloseTo(want[1], 6);
      expect(pos).not.toEqual(scene.objects.find((o) => o.id === free)!.pos);
      expect(errors).toEqual([]);
      await context.close();
    });
  }

  it("changes only the position of the dragged object", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    const before = await sceneOf(page);
    const from = await screenOf(page, "iso", free);
    await dragMouse(page, from, [from[0] + 40, from[1] - 20]);
    const after = await sceneOf(page);
    const { objects: a, ...restBefore } = before;
    const { objects: b, ...restAfter } = after;
    expect(restAfter).toEqual(restBefore);
    const moved = b.filter((o, i) => JSON.stringify(o) !== JSON.stringify(a[i]));
    expect(moved.map((o) => o.id)).toEqual([free]);
    const o = moved[0]!;
    const original = a.find((x) => x.id === free)!;
    expect({ ...o, pos: null }).toEqual({ ...original, pos: null });
    await context.close();
  });

  it("follows the snap step, and moves freely when snap is off", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    await page.selectOption("#snap", "0.5");
    const from = await screenOf(page, "plan", free);
    await dragMouse(page, from, [from[0] + 33, from[1] + 17]);
    const pos = await posOf(page, free);
    expect((pos[0]! / 0.5) % 1).toBeCloseTo(0, 9);
    expect((pos[1]! / 0.5) % 1).toBeCloseTo(0, 9);
    await page.selectOption("#snap", "0");
    const next = await screenOf(page, "plan", free);
    const scene = await sceneOf(page);
    const to: Vec2 = [next[0] + 13, next[1] + 7];
    const want = await expected(page, scene, "plan", free, next, to, 0);
    await dragMouse(page, next, to);
    const after = await posOf(page, free);
    expect(after[0]).toBeCloseTo(want[0], 6);
    expect(after[1]).toBeCloseTo(want[1], 6);
    await context.close();
  });

  it("shows the other view at the new place after a drag in one view", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    const planBefore = await screenOf(page, "plan", free);
    const from = await screenOf(page, "iso", free);
    await dragMouse(page, from, [from[0] + 60, from[1] + 30]);
    const planAfter = await screenOf(page, "plan", free);
    expect(Math.hypot(planAfter[0] - planBefore[0], planAfter[1] - planBefore[1])).toBeGreaterThan(3);
    await context.close();
  });

  it("selects an object on a tap without moving it, even with snap off", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    await page.selectOption("#snap", "0");
    const before = await sceneOf(page);
    const at = await screenOf(page, "iso", free);
    await page.mouse.move(at[0], at[1]);
    await page.mouse.down();
    await page.mouse.move(at[0] + 1, at[1]);
    await page.mouse.up();
    await frames(page, 2);
    expect(await sceneOf(page)).toEqual(before);
    expect(await ev<string | null>(page, "window.isoblock.state().selected")).toBe(free);
    expect(await page.locator("#undo").isDisabled()).toBe(true);
    await context.close();
  });
});

describe.skipIf(!hasBrowser)("editor: locks while dragging", () => {
  for (const view of ["iso", "plan"] as const) {
    it(`does not move an object whose pos is locked (${view})`, async () => {
      const { page, context } = await openEditor(browser, "crowd");
      const before = await sceneOf(page);
      const from = await screenOf(page, view, "o010");
      await dragMouse(page, from, [from[0] + 50, from[1] + 40]);
      expect(await sceneOf(page)).toEqual(before);
      expect(await status(page)).toContain("o010 is locked: pos");
      expect(await page.locator("#status.error").count()).toBe(1);
      expect(await page.locator("#undo").isDisabled()).toBe(true);
      expect(await dirty(page)).toBe(false);
      await context.close();
    });
  }

  it("blocks only the u axis when pos.u is locked", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    const before = await posOf(page, "o020");
    const from = await screenOf(page, "plan", "o020");
    await dragMouse(page, from, [from[0] + 30, from[1] + 30]);
    const after = await posOf(page, "o020");
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(await status(page)).toContain("o020 is locked: pos.u");
    await context.close();
  });

  it("blocks only the v axis when pos.v is locked", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    const before = await posOf(page, "o030");
    const from = await screenOf(page, "iso", "o030");
    await dragMouse(page, from, [from[0] + 40, from[1] + 10]);
    const after = await posOf(page, "o030");
    expect(after[1]).toBe(before[1]);
    expect(after[0]).not.toBe(before[0]);
    expect(await status(page)).toContain("o030 is locked: pos.v");
    await context.close();
  });

  it("lets an object with only a rot lock move", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    const before = await posOf(page, "o040");
    const from = await screenOf(page, "plan", "o040");
    await dragMouse(page, from, [from[0] + 25, from[1] + 25]);
    expect(await posOf(page, "o040")).not.toEqual(before);
    await context.close();
  });

  it("shows a lock icon on every locked object and on no other", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    const locked = crowd.objects.filter((o) => (o.locks ?? []).length > 0).map((o) => o.id);
    expect(locked).toHaveLength(20);
    for (const view of ["iso", "plan"] as const) {
      const icons = await ev<string[]>(page, `window.isoblock.lockIcons(${JSON.stringify(view)})`);
      expect([...icons].sort()).toEqual([...locked].sort());
    }
    await context.close();
  });

  it("shows no lock icon in a scene without locks", async () => {
    const { page, context } = await openEditor(browser, "overlap");
    expect(await ev<string[]>(page, 'window.isoblock.lockIcons("iso")')).toEqual([]);
    await context.close();
  });
});

describe.skipIf(!hasBrowser)("editor: history", () => {
  it("undoes and redoes a whole drag as one step, with buttons and keys", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    const start = await posOf(page, free);
    const from = await screenOf(page, "iso", free);
    await dragMouse(page, from, [from[0] + 60, from[1] + 20], 12);
    const moved = await posOf(page, free);
    expect(moved).not.toEqual(start);
    expect(await dirty(page)).toBe(true);
    expect(await page.locator("#undo").isEnabled()).toBe(true);
    await page.click("#undo");
    expect(await posOf(page, free)).toEqual(start);
    expect(await page.locator("#undo").isDisabled()).toBe(true);
    expect(await dirty(page)).toBe(false);
    await page.click("#redo");
    expect(await posOf(page, free)).toEqual(moved);
    await page.keyboard.press("Control+z");
    expect(await posOf(page, free)).toEqual(start);
    await page.keyboard.press("Control+Shift+z");
    expect(await posOf(page, free)).toEqual(moved);
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+y");
    expect(await posOf(page, free)).toEqual(moved);
    await context.close();
  });

  it("keeps several drags as several steps", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    // An object in the last row, dragged away from the others into free space.
    const lone = "o185";
    const start = await posOf(page, lone);
    for (let i = 0; i < 3; i++) {
      const from = await screenOf(page, "plan", lone);
      await dragMouse(page, from, [from[0], from[1] + 20], 4);
    }
    const end = await posOf(page, lone);
    expect(end[1]).toBeGreaterThan(start[1]!);
    await page.click("#undo");
    await page.click("#undo");
    expect(await posOf(page, lone)).not.toEqual(start);
    await page.click("#undo");
    expect(await posOf(page, lone)).toEqual(start);
    expect(await page.locator("#undo").isDisabled()).toBe(true);
    await page.click("#redo");
    await page.click("#redo");
    await page.click("#redo");
    expect(await posOf(page, lone)).toEqual(end);
    await context.close();
  });

  it("clears the unsaved mark when the file is saved", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    const from = await screenOf(page, "iso", free);
    await dragMouse(page, from, [from[0] + 30, from[1]]);
    expect(await dirty(page)).toBe(true);
    await Promise.all([page.waitForEvent("download"), page.click("#save")]);
    await frames(page, 2);
    expect(await dirty(page)).toBe(false);
    await context.close();
  });
});

describe.skipIf(!hasBrowser)("editor: pan and zoom", () => {
  it("pans when the empty background is dragged, without changing the scene", async () => {
    const { page, context } = await openEditor(browser, "yard");
    const before = await ev<{ scale: number; tx: number; ty: number }>(page, 'window.isoblock.viewport("iso")');
    const scene = await sceneOf(page);
    const box = (await page.locator('figure.view[data-view="iso"] canvas').boundingBox())!;
    await dragMouse(page, [box.x + 20, box.y + 20], [box.x + 70, box.y + 50], 5);
    const after = await ev<{ scale: number; tx: number; ty: number }>(page, 'window.isoblock.viewport("iso")');
    expect(after.scale).toBe(before.scale);
    expect(after.tx - before.tx).toBeCloseTo(50, 6);
    expect(after.ty - before.ty).toBeCloseTo(30, 6);
    expect(await sceneOf(page)).toEqual(scene);
    await context.close();
  });

  it("zooms with the wheel about the pointer, and Fit brings the whole scene back", async () => {
    const { page, context } = await openEditor(browser, "yard");
    const fit = await ev<{ scale: number; tx: number; ty: number }>(page, 'window.isoblock.viewport("iso")');
    const box = (await page.locator('figure.view[data-view="iso"] canvas').boundingBox())!;
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.wheel(0, -300);
    await frames(page, 3);
    const zoomed = await ev<{ scale: number; tx: number; ty: number }>(page, 'window.isoblock.viewport("iso")');
    expect(zoomed.scale).toBeGreaterThan(fit.scale * 1.3);
    const under = (vp: { scale: number; tx: number; ty: number }) => [(200 - vp.tx) / vp.scale, (200 - vp.ty) / vp.scale];
    expect(under(zoomed)[0]).toBeCloseTo(under(fit)[0]!, 6);
    expect(under(zoomed)[1]).toBeCloseTo(under(fit)[1]!, 6);
    await page.click('button[data-fit="iso"]');
    await frames(page, 2);
    const back = await ev<{ scale: number; tx: number; ty: number }>(page, 'window.isoblock.viewport("iso")');
    expect(back.scale).toBeCloseTo(fit.scale, 9);
    await context.close();
  });

  it("keeps dragging objects at the right place after a zoom", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    const box = (await page.locator('figure.view[data-view="plan"] canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    await frames(page, 3);
    const scene = await sceneOf(page);
    const candidates = scene.objects.filter((o) => (o.locks ?? []).length === 0).map((o) => o.id);
    let target: string | null = null;
    let from: Vec2 | null = null;
    for (const c of candidates) {
      try {
        from = await screenOf(page, "plan", c);
        target = c;
        break;
      } catch {
        // not visible after the zoom
      }
    }
    expect(target).not.toBeNull();
    const to: Vec2 = [from![0] + 30, from![1] + 20];
    const want = await expected(page, scene, "plan", target!, from!, to, 0.1);
    await dragMouse(page, from!, to);
    const pos = await posOf(page, target!);
    expect(pos[0]).toBeCloseTo(want[0], 6);
    expect(pos[1]).toBeCloseTo(want[1], 6);
    await context.close();
  });
});

describe.skipIf(!hasBrowser)("editor: painting while dragging", () => {
  /**
   * Compare a view as painted (clipped to what changed) with a full repaint. The browser
   * anti-aliases edges a little differently under a clip: most differing pixels are within a few
   * levels and now and then one edge pixel is off by up to about 80. Anything that is not
   * anti-aliasing (a missed object, label, outline or lock icon) differs by 100 and more on
   * many pixels.
   */
  async function compareWithFullRepaint(page: Page, view: View): Promise<{ large: number; medium: number; any: number; pixels: number }> {
    await ev(
      page,
      `(() => { const c = document.querySelector('figure.view[data-view="${view}"] canvas');
        window.__painted = c.getContext('2d').getImageData(0, 0, c.width, c.height); window.isoblock.redraw(${JSON.stringify(view)}); })()`,
    );
    await frames(page, 3);
    return ev(
      page,
      `(() => { const c = document.querySelector('figure.view[data-view="${view}"] canvas');
        const a = window.__painted.data, b = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let large = 0, medium = 0, any = 0;
        for (let i = 0; i < a.length; i += 4) {
          const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
          if (d > 0) any++;
          if (d > 48) medium++;
          if (d > 96) large++;
        }
        return { large, medium, any, pixels: a.length / 4 }; })()`,
    );
  }

  async function expectSameAsFullRepaint(page: Page, views: readonly View[]): Promise<void> {
    for (const view of views) {
      const diff = await compareWithFullRepaint(page, view);
      expect(diff.large, `${view} view: pixels that differ by more than 96 levels`).toBe(0);
      expect(diff.medium, `${view} view: pixels that differ by more than 48 levels`).toBeLessThanOrEqual(8);
      expect(diff.any / diff.pixels, `${view} view: share of pixels that differ at all`).toBeLessThan(0.01);
    }
  }

  const partialDraws = (page: Page) => ev<number>(page, "window.isoblock.frames.snapshot().partialDraws");

  it("paints what a drag changed as a clipped rectangle that matches a full repaint, in both views", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    const start = await partialDraws(page);
    for (const id of ["o101", "o057"]) {
      const from = await screenOf(page, "plan", id);
      await page.mouse.move(from[0], from[1]);
      await page.mouse.down();
      for (let i = 1; i <= 7; i++) {
        await page.mouse.move(from[0] + i * 9, from[1] + (i % 2 === 0 ? 14 : -10) + i * 3);
        await frames(page, 3);
        await expectSameAsFullRepaint(page, ["iso", "plan"]);
      }
      await page.mouse.up();
      await frames(page, 3);
      await expectSameAsFullRepaint(page, ["iso", "plan"]);
    }
    expect(await partialDraws(page)).toBeGreaterThan(start + 10);
    await context.close();
  });

  it("does the same on a high-density screen, with locked objects that show their icons", async () => {
    const { page, context } = await openEditor(browser, "crowd", { viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });
    const from = await screenOf(page, "iso", "o101");
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(from[0] + i * 11, from[1] - i * 4);
      await frames(page, 3);
      await expectSameAsFullRepaint(page, ["iso", "plan"]);
    }
    await page.mouse.up();
    await context.close();
  });

  it("repaints everything, not a rectangle, when the drag ends or the view changes", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    const from = await screenOf(page, "iso", "o101");
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    await page.mouse.move(from[0] + 20, from[1] + 5);
    await frames(page, 3);
    await page.mouse.move(from[0] + 30, from[1] + 8);
    await frames(page, 3);
    const during = await partialDraws(page);
    expect(during).toBeGreaterThan(0);
    await page.mouse.up();
    await frames(page, 3);
    expect(await partialDraws(page)).toBe(during);
    await page.mouse.wheel(0, -200);
    await frames(page, 3);
    expect(await partialDraws(page)).toBe(during);
    await context.close();
  });
});
