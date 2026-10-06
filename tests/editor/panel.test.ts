import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runChecks } from "../../src/core/checks";
import type { Scene } from "../../src/core/types";
import { checkRows, dragMouse, ev, frames, hasBrowser, launch, openEditor, posOf, sceneFile, sceneOf, screenOf, type View } from "../helpers/browser";
import { loadScene } from "../helpers/fixtures";
import { makeScene } from "../helpers/scene";

let browser: Browser;

beforeAll(async () => {
  if (hasBrowser) browser = await launch();
});

afterAll(async () => {
  await browser?.close();
});

const status = (page: Page) => ev<string>(page, "document.querySelector('#status').textContent");
const prop = (name: string) => `#props-body [data-prop="${name}"]`;
const lock = (path: string) => `#props-body [data-lock="${path}"]`;
const mark = (name: string) => `#props-body [data-mark="${name}"]`;
const value = (page: Page, name: string) => page.inputValue(prop(name));

/** Tap an object in a view to select it. */
async function select(page: Page, id: string, view: View = "plan"): Promise<void> {
  const at = await screenOf(page, view, id);
  await page.mouse.click(at[0], at[1]);
  await page.waitForFunction(`window.isoblock.state().selected === ${JSON.stringify(id)}`);
}

/** Set a field the way a person does: type, then leave the field. */
async function type(page: Page, name: string, text: string): Promise<void> {
  await page.fill(prop(name), text);
  await page.dispatchEvent(prop(name), "change");
  await frames(page, 2);
}

describe.skipIf(!hasBrowser)("editor: property panel", () => {
  it("asks for a selection while nothing is selected", async () => {
    const { page, context } = await openEditor(browser, "yard");
    expect(await page.textContent("#props-body")).toContain("Select an object");
    await context.close();
  });

  it("shows the selected object: position, rotation, type and the size of its type, with units", async () => {
    const { page, context } = await openEditor(browser, "yard");
    await select(page, "bench");
    expect(await page.textContent("#props-body .props-title strong")).toBe("bench");
    expect(await value(page, "u")).toBe("3.4");
    expect(await value(page, "v")).toBe("2.6");
    expect(await value(page, "w")).toBe("1.2");
    expect(await value(page, "d")).toBe("0.4");
    expect(await value(page, "h")).toBe("0.5");
    expect(await page.inputValue(prop("rot"))).toBe("0");
    expect(await page.inputValue(prop("type"))).toBe("bench");
    const units = await page.locator("#props-body .field .unit").allTextContents();
    expect(units.filter((u) => u === "u")).toHaveLength(5);
    await context.close();
  });

  it("follows the selection from either view", async () => {
    const { page, context } = await openEditor(browser, "yard");
    await select(page, "crate1", "iso");
    expect(await page.textContent("#props-body .props-title strong")).toBe("crate1");
    await select(page, "bench", "plan");
    expect(await page.textContent("#props-body .props-title strong")).toBe("bench");
    await context.close();
  });

  it("marks a number that has an assumption as provisional, with its note", async () => {
    const { page, context } = await openEditor(browser, "yard");
    await select(page, "tree", "iso");
    expect(await page.locator(mark("h")).isVisible()).toBe(true);
    expect(await page.getAttribute(mark("h"), "title")).toContain("height not given in the brief");
    expect(await page.getAttribute(mark("h"), "title")).toContain("designer");
    expect(await page.locator(mark("w")).isVisible()).toBe(false);
    expect(await page.locator(mark("u")).isVisible()).toBe(false);
    await context.close();
  });

  it("marks the provisional height of every object of that type, and no other object", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    const post = loadScene("crowd").objects.find((o) => o.type === "post" && !(o.locks ?? []).length)!.id;
    const box = loadScene("crowd").objects.find((o) => o.type === "box" && !(o.locks ?? []).length)!.id;
    await select(page, post);
    expect(await page.locator(mark("h")).isVisible()).toBe(true);
    await select(page, box);
    expect(await page.locator(mark("h")).isVisible()).toBe(false);
    await context.close();
  });

  it("marks a provisional position or rotation of an object", async () => {
    const scene = makeScene({
      objects: [{ id: "a", type: "box", pos: [1, 2], rot: 90 }],
      assumptions: [
        { path: "/objects/0/pos/1", value: 2, note: "from a sketch" },
        { path: "/objects/0/rot", value: 90 },
      ],
    });
    const { page, context } = await openEditor(browser, sceneFile("marks.scene.json", scene));
    await select(page, "a", "plan");
    expect(await page.locator(mark("u")).isVisible()).toBe(false);
    expect(await page.locator(mark("v")).isVisible()).toBe(true);
    expect(await page.locator(mark("rot")).isVisible()).toBe(true);
    await context.close();
  });

  it("moves an object when a position is typed, as one undoable step", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    await select(page, "o101");
    const before = await posOf(page, "o101");
    await type(page, "u", "7.25");
    expect((await posOf(page, "o101"))[0]).toBe(7.25);
    expect((await posOf(page, "o101"))[1]).toBe(before[1]);
    await page.click("#undo");
    expect(await posOf(page, "o101")).toEqual(before);
    expect(await page.locator("#undo").isDisabled()).toBe(true);
    await context.close();
  });

  it("updates the fields while an object is dragged", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    await select(page, "o101");
    const from = await screenOf(page, "plan", "o101");
    await dragMouse(page, from, [from[0] + 40, from[1] + 30]);
    const pos = await posOf(page, "o101");
    expect(Number(await value(page, "u"))).toBeCloseTo(pos[0]!, 9);
    expect(Number(await value(page, "v"))).toBeCloseTo(pos[1]!, 9);
    await context.close();
  });

  it("turns an object and changes its type", async () => {
    const { page, context } = await openEditor(browser, "yard");
    await select(page, "crate1");
    await page.selectOption(prop("rot"), "90");
    expect((await sceneOf(page)).objects.find((o) => o.id === "crate1")!.rot).toBe(90);
    await page.selectOption(prop("type"), "bench");
    expect((await sceneOf(page)).objects.find((o) => o.id === "crate1")!.type).toBe("bench");
    expect(await value(page, "w")).toBe("1.2");
    await page.click("#undo");
    await page.click("#undo");
    expect((await sceneOf(page)).objects.find((o) => o.id === "crate1")!.type).toBe("crate");
    await context.close();
  });

  it("edits the size of a type, which changes every object of that type, and keeps the assumption in step", async () => {
    const { page, context } = await openEditor(browser, "yard");
    await select(page, "crate1");
    await type(page, "h", "0.9");
    const scene = await sceneOf(page);
    expect(scene.types.crate!.size[2]).toBe(0.9);
    expect(scene.objects.map((o) => o.id)).toEqual(loadScene("yard").objects.map((o) => o.id));
    await select(page, "tree", "iso");
    await type(page, "h", "2.6");
    const after = await sceneOf(page);
    expect(after.types.tree!.size[2]).toBe(2.6);
    expect(after.assumptions![0]).toMatchObject({ path: "/types/tree/size/2", value: 2.6, note: "height not given in the brief" });
    expect(await page.locator(mark("h")).isVisible()).toBe(true);
    await context.close();
  });

  it("rejects a value that is not a number and shows the old value again", async () => {
    const { page, context } = await openEditor(browser, "yard");
    await select(page, "bench");
    await page.fill(prop("u"), "");
    await page.dispatchEvent(prop("u"), "change");
    await frames(page, 2);
    expect(await value(page, "u")).toBe("3.4");
    expect(await status(page)).toContain("must be a number");
    await type(page, "w", "-1");
    expect(await value(page, "w")).toBe("1.2");
    expect(await status(page)).toContain("size must be 0 or more");
    expect(await page.locator("#undo").isDisabled()).toBe(true);
    await context.close();
  });
});

describe.skipIf(!hasBrowser)("editor: lock toggles", () => {
  it("shows the locks the object has", async () => {
    const { page, context } = await openEditor(browser, "yard");
    await select(page, "tree", "iso");
    expect(await page.getAttribute(lock("pos"), "aria-pressed")).toBe("true");
    expect(await page.getAttribute(lock("pos.u"), "aria-pressed")).toBe("true");
    expect(await page.isDisabled(lock("pos.u"))).toBe(true);
    expect(await page.getAttribute(lock("rot"), "aria-pressed")).toBe("false");
    await context.close();
  });

  it("locks one axis, which then cannot be dragged or typed, and unlocks it again", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    await select(page, "o101");
    const start = await posOf(page, "o101");
    await page.click(lock("pos.u"));
    expect((await sceneOf(page)).objects.find((o) => o.id === "o101")!.locks).toEqual(["pos.u"]);
    const from = await screenOf(page, "plan", "o101");
    await dragMouse(page, from, [from[0] + 20, from[1] + 20]);
    const dragged = await posOf(page, "o101");
    expect(dragged[0]).toBe(start[0]);
    expect(dragged[1]).not.toBe(start[1]);
    await type(page, "u", "9");
    expect((await posOf(page, "o101"))[0]).toBe(start[0]);
    expect(await value(page, "u")).toBe(String(start[0]));
    expect(await status(page)).toContain("o101 is locked: pos.u");
    await page.click(lock("pos.u"));
    await type(page, "u", "9");
    expect((await posOf(page, "o101"))[0]).toBe(9);
    expect("locks" in (await sceneOf(page)).objects.find((o) => o.id === "o101")!).toBe(false);
    await context.close();
  });

  it("locks the whole position, and the axis toggles follow", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    await select(page, "o101");
    await page.click(lock("pos"));
    expect(await page.getAttribute(lock("pos.v"), "aria-pressed")).toBe("true");
    expect(await page.isDisabled(lock("pos.v"))).toBe(true);
    const before = await posOf(page, "o101");
    const from = await screenOf(page, "iso", "o101");
    await dragMouse(page, from, [from[0] + 40, from[1] + 20]);
    expect(await posOf(page, "o101")).toEqual(before);
    await context.close();
  });

  it("locks rotation and type, and refuses to change them", async () => {
    const { page, context } = await openEditor(browser, "yard");
    await select(page, "crate2");
    await page.click(lock("rot"));
    await page.click(lock("type"));
    await page.selectOption(prop("rot"), "180");
    expect(await status(page)).toContain("crate2 is locked: rot");
    expect(await page.inputValue(prop("rot"))).toBe("0");
    await page.selectOption(prop("type"), "bench");
    expect(await status(page)).toContain("crate2 is locked: type");
    expect(await page.inputValue(prop("type"))).toBe("crate");
    const object = (await sceneOf(page)).objects.find((o) => o.id === "crate2")!;
    expect(object).toMatchObject({ type: "crate", locks: ["rot", "type"] });
    await context.close();
  });

  it("locks a size of a type, which blocks the edit for every object of the type", async () => {
    const { page, context } = await openEditor(browser, "yard");
    await select(page, "crate1");
    await page.click(lock("/types/crate/size/2"));
    await type(page, "h", "2");
    expect(await status(page)).toContain("/types/crate/size/2");
    expect((await sceneOf(page)).types.crate!.size[2]).toBe(loadScene("yard").types.crate!.size[2]);
    await select(page, "crate2");
    expect(await page.getAttribute(lock("/types/crate/size/2"), "aria-pressed")).toBe("true");
    expect(await page.isDisabled(lock("/types/crate/size/2"))).toBe(true);
    await context.close();
  });

  it("undoes a lock change", async () => {
    const { page, context } = await openEditor(browser, "yard");
    await select(page, "bench");
    await page.click(lock("pos"));
    expect((await sceneOf(page)).objects.find((o) => o.id === "bench")!.locks).toEqual(["pos"]);
    await page.click("#undo");
    expect("locks" in (await sceneOf(page)).objects.find((o) => o.id === "bench")!).toBe(false);
    expect(await page.getAttribute(lock("pos"), "aria-pressed")).toBe("false");
    await context.close();
  });
});

describe.skipIf(!hasBrowser)("editor: check panel", () => {
  it("shows pass, fail and skip rows with id, check and message", async () => {
    const { page, context } = await openEditor(browser, "lane");
    const text = await page.locator("#checks-list").textContent();
    expect(text).toContain("SKIP");
    expect(text).toContain("FAIL");
    expect(text).toContain("PASS");
    expect(await page.textContent("#checks-count")).toMatch(/fail/);
    await context.close();
  });

  it("highlights the objects of a row when it is tapped, and clears on a second tap", async () => {
    const { page, context } = await openEditor(browser, "yard");
    await page.click('[data-check="c4"]');
    expect(await ev<string[]>(page, "window.isoblock.state().highlight")).toEqual(["crate1", "crate2"]);
    expect((await checkRows(page)).find((r) => r[0] === "c4")![2]).toBe("true");
    await page.click('[data-check="c8"]');
    expect(await ev<string[]>(page, "window.isoblock.state().highlight")).toEqual(["actor"]);
    expect((await checkRows(page)).filter((r) => r[2] === "true").map((r) => r[0])).toEqual(["c8"]);
    await page.click('[data-check="c8"]');
    expect(await ev<string[]>(page, "window.isoblock.state().highlight")).toEqual([]);
    await page.click('[data-check="c4"]');
    await page.keyboard.press("Escape");
    expect(await ev<string[]>(page, "window.isoblock.state().highlight")).toEqual([]);
    await context.close();
  });

  it("draws the highlight on the objects in both views", async () => {
    const { page, context } = await openEditor(browser, "yard");
    const count = async (view: View, id: string) => {
      const at = await screenOf(page, view, id);
      const box = (await page.locator(`figure.view[data-view="${view}"] canvas`).boundingBox())!;
      return ev<number>(
        page,
        `(() => { const c = document.querySelector('figure.view[data-view="${view}"] canvas'); const cx = ${at[0] - box.x}; const cy = ${at[1] - box.y};
          const d = c.getContext('2d').getImageData(Math.max(0, cx - 40), Math.max(0, cy - 40), 80, 80).data; let n = 0;
          for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 224) < 12 && Math.abs(d[i + 1] - 164) < 12 && d[i + 2] < 30) n++; return n; })()`,
      );
    };
    for (const view of ["iso", "plan"] as const) {
      expect(await count(view, "crate1")).toBe(0);
      await page.click('[data-check="c4"]');
      await frames(page, 3);
      expect(await count(view, "crate1")).toBeGreaterThan(10);
      await page.click('[data-check="c4"]');
      await frames(page, 3);
    }
    await context.close();
  });

  it("keeps the selection when a row is tapped", async () => {
    const { page, context } = await openEditor(browser, "yard");
    await select(page, "bench");
    await page.click('[data-check="c4"]');
    expect(await ev<string | null>(page, "window.isoblock.state().selected")).toBe("bench");
    await context.close();
  });

  it("re-runs the checks live while an object is dragged, and again on undo", async () => {
    const { page, context } = await openEditor(browser, "crowd");
    const row = (id: string) => ev<string>(page, `document.querySelector('[data-check="${id}"]').dataset.status`);
    expect(await row("c3")).toBe("fail");
    const from = await screenOf(page, "plan", "o199");
    // Drag o199 down, out of the grid, away from o200.
    await dragMouse(page, from, [from[0], from[1] + 50], 6);
    expect(await row("c3")).toBe("pass");
    const scene = await sceneOf(page);
    const live = (await checkRows(page)).map((r) => [r[0], r[1]]);
    expect(live).toEqual(runChecks(scene as Scene).map((r) => [r.id, r.status]));
    await page.click("#undo");
    expect(await row("c3")).toBe("fail");
    await context.close();
  });

  it("matches a full run of the checks after any drag", async () => {
    const { page, context } = await openEditor(browser, "yard");
    const from = await screenOf(page, "plan", "actor");
    await dragMouse(page, from, [from[0] + 70, from[1] + 5], 6);
    const scene = await sceneOf(page);
    const shown = (await checkRows(page)).map((r) => [r[0], r[1]]);
    expect(shown).toEqual(runChecks(scene).map((r) => [r.id, r.status]));
    await context.close();
  });
});
