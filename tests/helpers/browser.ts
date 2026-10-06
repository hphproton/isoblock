import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from "playwright-core";
import { fromCanvas, type Viewport } from "../../src/core/viewport";
import type { Scene, Vec2 } from "../../src/core/types";
import { fixturePath, repoRoot } from "./fixtures";

export const editorUrl = pathToFileURL(join(repoRoot, "dist", "editor.html")).href;

function playwrightPath(): string | undefined {
  try {
    return chromium.executablePath();
  } catch {
    return undefined;
  }
}

/** An installed Chromium: `ISOBLOCK_CHROMIUM`, then the one in /opt/pw-browsers, then Playwright's own. */
export function chromiumPath(): string | undefined {
  return [process.env.ISOBLOCK_CHROMIUM, "/opt/pw-browsers/chromium", playwrightPath()].find(
    (p) => p !== undefined && p !== "" && existsSync(p),
  );
}

export const hasBrowser = chromiumPath() !== undefined;

export function launch(): Promise<Browser> {
  return chromium.launch({ executablePath: chromiumPath() as string, args: ["--no-sandbox"] });
}

/** Run an expression in the page. Expressions are strings because the tests have no DOM types. */
export async function ev<T>(page: Page, expression: string): Promise<T> {
  return (await page.evaluate(expression)) as T;
}

export type View = "iso" | "plan";
export type SceneInput = string | { readonly name: string; readonly mimeType: string; readonly buffer: Buffer };

/** Wait until the page has painted at least `n` animation frames since the call. */
export async function frames(page: Page, n = 2): Promise<void> {
  await ev(
    page,
    `new Promise((done) => { let left = ${n}; const tick = () => (--left <= 0 ? done(true) : requestAnimationFrame(tick)); requestAnimationFrame(tick); })`,
  );
}

export interface EditorPage {
  readonly page: Page;
  readonly context: BrowserContext;
}

export function sceneFile(name: string, scene: unknown): SceneInput {
  return { name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(scene)) };
}

export async function openEditor(
  browser: Browser,
  scene: SceneInput | null,
  options: Parameters<Browser["newContext"]>[0] = { viewport: { width: 1280, height: 800 } },
): Promise<EditorPage & { errors: string[] }> {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  await page.goto(editorUrl);
  if (scene !== null) {
    await page.setInputFiles("#file", typeof scene === "string" ? fixturePath(scene) : scene);
    await page.waitForFunction("window.isoblock && window.isoblock.scene() !== null");
    await frames(page, 3);
  }
  return { page, context, errors };
}

export async function sceneOf(page: Page): Promise<Scene> {
  return ev<Scene>(page, "window.isoblock.scene()");
}

export async function posOf(page: Page, id: string): Promise<readonly number[]> {
  const scene = await sceneOf(page);
  return (scene.objects.find((o) => o.id === id) as { pos: readonly number[] }).pos;
}

export async function screenOf(page: Page, view: View, id: string): Promise<Vec2> {
  const point = await ev<Vec2 | null>(page, `window.isoblock.screenOf(${JSON.stringify(view)}, ${JSON.stringify(id)})`);
  if (point === null) throw new Error(`object ${id} is not visible in the ${view} view`);
  return point;
}

export async function canvasBox(page: Page, view: View): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator(`figure.view[data-view="${view}"] canvas`).boundingBox();
  if (box === null) throw new Error(`the ${view} view is not visible`);
  return box;
}

/** Display coordinates (the units of the display list) of a page point in a view. */
export async function displayPoint(page: Page, view: View, at: Vec2): Promise<Vec2> {
  const box = await canvasBox(page, view);
  const viewport = await ev<Viewport>(page, `window.isoblock.viewport(${JSON.stringify(view)})`);
  return fromCanvas(viewport, [at[0] - box.x, at[1] - box.y]);
}

/** Press, move in `steps` frames and release the mouse. */
export async function dragMouse(page: Page, from: Vec2, to: Vec2, steps = 8): Promise<void> {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
    await frames(page, 1);
  }
  await page.mouse.up();
  await frames(page, 2);
}

export function cdp(context: BrowserContext, page: Page): Promise<CDPSession> {
  return context.newCDPSession(page);
}

/** Percentile of a list of numbers (nearest rank). */
export function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? Number.NaN;
}

export type CheckRow = readonly [id: string, status: string, pressed: string];

/** The rows of the check panel: id, status and whether the row is pressed. */
export function checkRows(page: Page): Promise<CheckRow[]> {
  return ev<CheckRow[]>(
    page,
    "Array.from(document.querySelectorAll('#checks-list button.check')).map((n) => [n.dataset.check, n.dataset.status, n.getAttribute('aria-pressed')])",
  );
}

/** Touch input through the DevTools protocol: every call sends the full set of active fingers. */
export class Fingers {
  constructor(private readonly client: CDPSession) {}

  private send(type: "touchStart" | "touchMove" | "touchEnd", points: readonly Vec2[]): Promise<unknown> {
    return this.client.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map(([x, y], id) => ({ x, y, id })),
    });
  }

  down(points: readonly Vec2[]): Promise<unknown> {
    return this.send("touchStart", points);
  }

  move(points: readonly Vec2[]): Promise<unknown> {
    return this.send("touchMove", points);
  }

  up(): Promise<unknown> {
    return this.send("touchEnd", []);
  }
}

/** A drag with one finger in `steps` frames. */
export async function dragTouch(fingers: Fingers, page: Page, from: Vec2, to: Vec2, steps = 8): Promise<void> {
  await fingers.down([from]);
  for (let i = 1; i <= steps; i++) {
    await fingers.move([[from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]]);
    await frames(page, 1);
  }
  await fingers.up();
  await frames(page, 2);
}

export const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
} as const;
