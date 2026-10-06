import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Vec2 } from "../../src/core/types";
import type { FrameSnapshot } from "../../src/editor/stats";
import { ev, Fingers, hasBrowser, launch, openEditor, percentile, phone, screenOf } from "../helpers/browser";

let browser: Browser;

beforeAll(async () => {
  if (hasBrowser) browser = await launch();
});

afterAll(async () => {
  await browser?.close();
});

/** SPEC section 17, stage 2: the 95th percentile of the frame time while dragging, at most this many ms. */
const BUDGET_MS = 16.7;
/** SPEC section 17, stage 2: CPU slowdown of the headless browser, standing in for a mid-range phone. */
const SLOWDOWN = 4;
const WARMUP = 20;
const STEPS = 170;
const OBJECT = "o101";

/** Small circles around the start point, so the dragged object keeps moving over a crowded area. */
function path(from: Vec2): Vec2[] {
  return Array.from({ length: STEPS }, (_, i) => {
    const a = (i / 25) * Math.PI * 2;
    return [from[0] + 36 * Math.sin(a), from[1] + 24 * (1 - Math.cos(a))] as Vec2;
  });
}

interface Drag {
  down(at: Vec2): Promise<unknown>;
  move(at: Vec2): Promise<unknown>;
  up(): Promise<unknown>;
}

/**
 * Drag along the path as fast as the page takes input and record the frames after a warm-up.
 * A frame is one animation frame callback of the editor: handling the pointer, the check update,
 * the display list and painting, measured with `performance.now()` inside the page.
 */
async function measure(page: Page, from: Vec2, drag: Drag): Promise<FrameSnapshot> {
  const points = path(from);
  await drag.down(from);
  for (const p of points.slice(0, WARMUP)) await drag.move(p);
  await ev(page, "window.isoblock.frames.start()");
  for (const p of points.slice(WARMUP)) await drag.move(p);
  await ev(page, "window.isoblock.frames.stop()");
  await drag.up();
  return ev<FrameSnapshot>(page, "window.isoblock.frames.snapshot()");
}

function report(label: string, snapshot: FrameSnapshot): number {
  const f = (n: number) => n.toFixed(2);
  const stat = (values: readonly number[]) => `p50 ${f(percentile(values, 50))} p95 ${f(percentile(values, 95))} max ${f(Math.max(...values))}`;
  const phases = Object.entries(snapshot.phases)
    .map(([name, total]) => `${name} ${f(total / snapshot.work.length)}`)
    .join(", ");
  console.log(
    `frame time, ${label}: ${snapshot.work.length} frames, ${snapshot.partialDraws} partial paints in total; ` +
      `work ${stat(snapshot.work)} ms; frame interval ${stat(snapshot.interval)} ms; mean ms per frame by phase: ${phases}`,
  );
  return percentile(snapshot.work, 95);
}

/**
 * Drag from inside the page: one pointer move per animation frame, like a hand on a 60 Hz screen,
 * so that the time between frames shows how fast the editor can produce them.
 */
async function measureAtDisplayRate(page: Page, from: Vec2): Promise<FrameSnapshot> {
  const points = path(from);
  await ev(
    page,
    `(() => {
      const canvas = document.elementFromPoint(${from[0]}, ${from[1]});
      const fire = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true }));
      const points = ${JSON.stringify(points)};
      window.__dragDone = new Promise((done) => {
        let i = 0;
        fire('pointerdown', ${from[0]}, ${from[1]});
        const tick = () => {
          if (i === ${WARMUP}) window.isoblock.frames.start();
          if (i >= points.length) { window.isoblock.frames.stop(); fire('pointerup', points[i - 1][0], points[i - 1][1]); done(true); return; }
          fire('pointermove', points[i][0], points[i][1]);
          i++;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    })()`,
  );
  await ev(page, "window.__dragDone");
  return ev<FrameSnapshot>(page, "window.isoblock.frames.snapshot()");
}

describe.skipIf(!hasBrowser)("editor: frame time while dragging 200 objects (SPEC section 17, stage 2)", () => {
  it(`desktop, isometric and plan view side by side, mouse: p95 at most ${BUDGET_MS} ms at ${SLOWDOWN}x CPU slowdown`, async () => {
    const { page, context } = await openEditor(browser, "crowd", { viewport: { width: 1280, height: 800 } });
    const client = await context.newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: SLOWDOWN });
    const from = await screenOf(page, "iso", OBJECT);
    const snapshot = await measure(page, from, {
      down: async (at) => {
        await page.mouse.move(at[0], at[1]);
        await page.mouse.down();
      },
      move: (at) => page.mouse.move(at[0], at[1]),
      up: () => page.mouse.up(),
    });
    expect(snapshot.work.length).toBeGreaterThan(100);
    expect(report("desktop, both views, mouse", snapshot)).toBeLessThanOrEqual(BUDGET_MS);
    await context.close();
  });

  it(`phone, one view, touch: p95 at most ${BUDGET_MS} ms at ${SLOWDOWN}x CPU slowdown`, async () => {
    const { page, context } = await openEditor(browser, "crowd", phone);
    const client = await context.newCDPSession(page);
    const fingers = new Fingers(client);
    await client.send("Emulation.setCPUThrottlingRate", { rate: SLOWDOWN });
    const from = await screenOf(page, "iso", OBJECT);
    const snapshot = await measure(page, from, {
      down: (at) => fingers.down([at]),
      move: (at) => fingers.move([at]),
      up: () => fingers.up(),
    });
    expect(snapshot.work.length).toBeGreaterThan(100);
    expect(report("phone, one view, touch", snapshot)).toBeLessThanOrEqual(BUDGET_MS);
    await context.close();
  });

  it(`input at the display rate, both views: p95 work at most ${BUDGET_MS} ms and frames keep coming at the display rate, at ${SLOWDOWN}x slowdown`, async () => {
    const { page, context } = await openEditor(browser, "crowd", { viewport: { width: 1280, height: 800 } });
    const client = await context.newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: SLOWDOWN });
    const snapshot = await measureAtDisplayRate(page, await screenOf(page, "iso", OBJECT));
    expect(snapshot.work.length).toBeGreaterThan(100);
    expect(report("desktop, both views, input at display rate", snapshot)).toBeLessThanOrEqual(BUDGET_MS);
    // At 60 Hz a frame comes every 16.7 ms; when the editor keeps up, the median is that.
    expect(percentile(snapshot.interval, 50)).toBeLessThanOrEqual(BUDGET_MS * 1.1);
    await context.close();
  });

  it(`phone with a 2x screen, input at the display rate: frames keep coming at the display rate, at ${SLOWDOWN}x slowdown`, async () => {
    const { page, context } = await openEditor(browser, "crowd", phone);
    const client = await context.newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: SLOWDOWN });
    const snapshot = await measureAtDisplayRate(page, await screenOf(page, "iso", OBJECT));
    expect(snapshot.work.length).toBeGreaterThan(100);
    expect(report("phone with a 2x screen, input at display rate", snapshot)).toBeLessThanOrEqual(BUDGET_MS);
    expect(percentile(snapshot.interval, 50)).toBeLessThanOrEqual(BUDGET_MS * 1.1);
    expect(percentile(snapshot.interval, 95)).toBeLessThanOrEqual(BUDGET_MS * 1.1);
    await context.close();
  });
});
