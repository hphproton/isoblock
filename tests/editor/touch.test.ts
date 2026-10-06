import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { groundDelta, snapValue } from "../../src/core/drag";
import {
  displayPoint,
  dragTouch,
  ev,
  Fingers,
  frames,
  hasBrowser,
  launch,
  openEditor,
  phone,
  posOf,
  sceneFile,
  sceneOf,
  screenOf,
  type View,
} from "../helpers/browser";
import type { Vec2 } from "../../src/core/types";
import { box, makeScene } from "../helpers/scene";

let browser: Browser;

beforeAll(async () => {
  if (hasBrowser) browser = await launch();
});

afterAll(async () => {
  await browser?.close();
});

type Viewport = { scale: number; tx: number; ty: number };
const viewport = (page: Page, view: View) => ev<Viewport>(page, `window.isoblock.viewport(${JSON.stringify(view)})`);

async function phoneEditor(scene: Parameters<typeof openEditor>[1]) {
  const opened = await openEditor(browser, scene, phone);
  const client = await opened.context.newCDPSession(opened.page);
  return { ...opened, fingers: new Fingers(client) };
}

describe.skipIf(!hasBrowser)("editor: touch", () => {
  it("shows one view at a time on a phone, and uses large controls for fingers", async () => {
    const { page, context } = await phoneEditor("crowd");
    expect(await ev<boolean>(page, "matchMedia('(pointer: coarse)').matches")).toBe(true);
    expect(await ev<string>(page, "window.isoblock.state().mode")).toBe("iso");
    expect(await page.locator('figure.view[data-view="plan"]').isVisible()).toBe(false);
    await page.click('button[data-mode="plan"]');
    await frames(page, 3);
    const at = await screenOf(page, "plan", "o101");
    await page.touchscreen.tap(at[0], at[1]);
    await page.waitForFunction("window.isoblock.state().selected === 'o101'");
    const heights = await ev<Record<string, number>>(
      page,
      `(() => { const h = (s) => Math.round(document.querySelector(s).getBoundingClientRect().height);
        return { open: h('#open'), save: h('#save'), undo: h('#undo'), mode: h('button[data-mode="iso"]'), snap: h('#snap'),
                 lock: h('[data-lock="pos"]'), field: h('[data-prop="u"]'), check: h('#checks-list button.check') }; })()`,
    );
    for (const [name, height] of Object.entries(heights)) expect(height, name).toBeGreaterThanOrEqual(44);
    await context.close();
  });

  it("moves an object with one finger, on the grid", async () => {
    const { page, context, fingers } = await phoneEditor("crowd");
    const scene = await sceneOf(page);
    const id = "o101";
    const from = await screenOf(page, "iso", id);
    const to: Vec2 = [from[0] + 36, from[1] + 22];
    const [du, dv] = groundDelta(scene.camera, await displayPoint(page, "iso", from), await displayPoint(page, "iso", to));
    const start = scene.objects.find((o) => o.id === id)!.pos;
    await dragTouch(fingers, page, from, to);
    const pos = await posOf(page, id);
    expect(pos[0]).toBeCloseTo(snapValue(start[0] + du, 0.1), 6);
    expect(pos[1]).toBeCloseTo(snapValue(start[1] + dv, 0.1), 6);
    expect(await page.locator("#undo").isEnabled()).toBe(true);
    await context.close();
  });

  it("does not move a locked object with a finger", async () => {
    const { page, context, fingers } = await phoneEditor("crowd");
    const before = await sceneOf(page);
    const from = await screenOf(page, "iso", "o010");
    await dragTouch(fingers, page, from, [from[0] + 30, from[1] + 30]);
    expect(await sceneOf(page)).toEqual(before);
    expect(await ev<string>(page, "document.querySelector('#status').textContent")).toContain("o010 is locked");
    await context.close();
  });

  it("pans the view with one finger on empty space", async () => {
    const { page, context, fingers } = await phoneEditor("yard");
    const before = await viewport(page, "iso");
    const scene = await sceneOf(page);
    const canvas = (await page.locator('figure.view[data-view="iso"] canvas').boundingBox())!;
    await dragTouch(fingers, page, [canvas.x + 10, canvas.y + 10], [canvas.x + 60, canvas.y + 40], 5);
    const after = await viewport(page, "iso");
    expect(after.tx - before.tx).toBeCloseTo(50, 6);
    expect(after.ty - before.ty).toBeCloseTo(30, 6);
    expect(after.scale).toBe(before.scale);
    expect(await sceneOf(page)).toEqual(scene);
    await context.close();
  });

  it("zooms with two fingers about their centre, without moving objects", async () => {
    const { page, context, fingers } = await phoneEditor("yard");
    const before = await viewport(page, "iso");
    const scene = await sceneOf(page);
    const canvas = (await page.locator('figure.view[data-view="iso"] canvas').boundingBox())!;
    const cx = canvas.x + canvas.width / 2;
    const cy = canvas.y + canvas.height / 2;
    await fingers.down([[cx - 30, cy], [cx + 30, cy]]);
    for (let i = 1; i <= 6; i++) {
      await fingers.move([[cx - 30 - i * 10, cy], [cx + 30 + i * 10, cy]]);
      await frames(page, 1);
    }
    await fingers.up();
    await frames(page, 2);
    const after = await viewport(page, "iso");
    expect(after.scale / before.scale).toBeCloseTo(180 / 60, 3);
    const centre = [cx - canvas.x, cy - canvas.y] as const;
    const under = (vp: Viewport) => [(centre[0] - vp.tx) / vp.scale, (centre[1] - vp.ty) / vp.scale];
    expect(under(after)[0]).toBeCloseTo(under(before)[0]!, 4);
    expect(under(after)[1]).toBeCloseTo(under(before)[1]!, 4);
    expect(await sceneOf(page)).toEqual(scene);
    await context.close();
  });

  it("zooms back out with a pinch", async () => {
    const { page, context, fingers } = await phoneEditor("yard");
    const before = await viewport(page, "iso");
    const canvas = (await page.locator('figure.view[data-view="iso"] canvas').boundingBox())!;
    const cx = canvas.x + canvas.width / 2;
    const cy = canvas.y + canvas.height / 2;
    await fingers.down([[cx - 80, cy], [cx + 80, cy]]);
    for (let i = 1; i <= 4; i++) {
      await fingers.move([[cx - 80 + i * 15, cy], [cx + 80 - i * 15, cy]]);
      await frames(page, 1);
    }
    await fingers.up();
    expect((await viewport(page, "iso")).scale).toBeLessThan(before.scale);
    await context.close();
  });

  it("drops the drag when a second finger comes down, and starts to zoom instead", async () => {
    const { page, context, fingers } = await phoneEditor("crowd");
    const before = await sceneOf(page);
    const vp = await viewport(page, "iso");
    const from = await screenOf(page, "iso", "o101");
    await fingers.down([from]);
    await fingers.move([[from[0] + 20, from[1] + 10]]);
    await frames(page, 2);
    await fingers.down([[from[0] + 20, from[1] + 10], [from[0] + 120, from[1] + 10]]);
    await fingers.move([[from[0] + 20, from[1] + 10], [from[0] + 160, from[1] + 10]]);
    await frames(page, 2);
    await fingers.up();
    await frames(page, 2);
    expect(await sceneOf(page)).toEqual(before);
    expect((await viewport(page, "iso")).scale).toBeGreaterThan(vp.scale);
    expect(await page.locator("#undo").isDisabled()).toBe(true);
    await context.close();
  });

  it("lets a finger hit a small object it only comes near, where a mouse would miss", async () => {
    const scene = makeScene({ objects: [box("a", [5, 5])] });
    const { page, context } = await phoneEditor(sceneFile("one.scene.json", scene));
    await page.click('button[data-mode="plan"]');
    await frames(page, 3);
    const centre = await screenOf(page, "plan", "a");
    const vp = await viewport(page, "plan");
    // The plan camera draws 40 px per unit; the object is 1 unit wide.
    const half = 0.5 * 40 * vp.scale;
    const near: Vec2 = [centre[0] + half + 14, centre[1]];
    await page.touchscreen.tap(near[0], near[1]);
    await page.waitForFunction("window.isoblock.state().selected === 'a'");
    await page.keyboard.press("Escape");
    expect(await ev<string | null>(page, "window.isoblock.state().selected")).toBeNull();
    await context.close();

    const desktop = await openEditor(browser, sceneFile("one.scene.json", scene), { viewport: { width: 1280, height: 800 } });
    const c = await screenOf(desktop.page, "plan", "a");
    const v = await viewport(desktop.page, "plan");
    const h = 0.5 * 40 * v.scale;
    await desktop.page.mouse.click(c[0] + h + 14, c[1]);
    await frames(desktop.page, 2);
    expect(await ev<string | null>(desktop.page, "window.isoblock.state().selected")).toBeNull();
    await desktop.context.close();
  });

  describe("pixel ratio", () => {
    const ratio = (page: Page) => ev<number>(page, 'window.isoblock.pixelRatio("iso")');
    const canvasWidth = (page: Page) => ev<number>(page, 'document.querySelector("figure.view[data-view=iso] canvas").width');
    const cssWidth = async (page: Page) => Math.floor((await page.locator("figure.view[data-view=iso] canvas").boundingBox())!.width);

    it("is the screen's while nothing moves", async () => {
      const { page, context } = await phoneEditor("crowd");
      expect(await ratio(page)).toBe(2);
      expect(await canvasWidth(page)).toBe(2 * (await cssWidth(page)));
      await context.close();
    });

    it("drops to 1 while an object is dragged, and is sharp again when the finger lifts", async () => {
      const { page, context, fingers } = await phoneEditor("crowd");
      const from = await screenOf(page, "iso", "o101");
      await fingers.down([from]);
      await fingers.move([[from[0] + 4, from[1] + 2]]);
      await frames(page, 2);
      await fingers.move([[from[0] + 30, from[1] + 12]]);
      await frames(page, 3);
      expect(await ratio(page)).toBe(1);
      expect(await canvasWidth(page)).toBe(await cssWidth(page));
      await fingers.up();
      await frames(page, 3);
      expect(await ratio(page)).toBe(2);
      expect(await canvasWidth(page)).toBe(2 * (await cssWidth(page)));
      await context.close();
    });

    it("does not change for a tap", async () => {
      const { page, context } = await phoneEditor("crowd");
      const at = await screenOf(page, "iso", "o101");
      await page.touchscreen.tap(at[0], at[1]);
      await frames(page, 3);
      expect(await ratio(page)).toBe(2);
      await context.close();
    });

    it("drops to 1 while the view is panned or pinched", async () => {
      const { page, context, fingers } = await phoneEditor("yard");
      const canvas = (await page.locator('figure.view[data-view="iso"] canvas').boundingBox())!;
      await fingers.down([[canvas.x + 10, canvas.y + 10]]);
      await fingers.move([[canvas.x + 40, canvas.y + 30]]);
      await frames(page, 3);
      expect(await ratio(page)).toBe(1);
      await fingers.up();
      await frames(page, 3);
      expect(await ratio(page)).toBe(2);
      const cx = canvas.x + canvas.width / 2;
      const cy = canvas.y + canvas.height / 2;
      await fingers.down([[cx - 30, cy], [cx + 30, cy]]);
      await fingers.move([[cx - 50, cy], [cx + 50, cy]]);
      await frames(page, 3);
      expect(await ratio(page)).toBe(1);
      await fingers.up();
      await frames(page, 3);
      expect(await ratio(page)).toBe(2);
      await context.close();
    });

    it("keeps objects under the finger: a drag at the lower ratio moves by the same ground distance", async () => {
      const { page, context, fingers } = await phoneEditor("crowd");
      const scene = await sceneOf(page);
      const from = await screenOf(page, "iso", "o101");
      const to: Vec2 = [from[0] + 36, from[1] + 22];
      const [du, dv] = groundDelta(scene.camera, await displayPoint(page, "iso", from), await displayPoint(page, "iso", to));
      const start = scene.objects.find((o) => o.id === "o101")!.pos;
      await dragTouch(fingers, page, from, to);
      const pos = await posOf(page, "o101");
      expect(pos[0]).toBeCloseTo(snapValue(start[0] + du, 0.1), 6);
      expect(pos[1]).toBeCloseTo(snapValue(start[1] + dv, 0.1), 6);
      await context.close();
    });
  });
});
