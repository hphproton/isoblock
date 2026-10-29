import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { planCamera } from "../../src/core/planView";
import { project } from "../../src/core/projection";
import { evaluateRelations } from "../../src/core/relations/evaluate";
import { facingFigure } from "../../src/core/relations/facing";
import { resolveTarget } from "../../src/core/relations/targets";
import type { Scene, Vec2, Vec3 } from "../../src/core/types";
import type { Viewport } from "../../src/core/viewport";
import { validateScene } from "../../src/core/validate";
import { ARROW_HEAD, FACING_SHAFT, arrowHead, traceArrowHead, type ArrowDraw } from "../../src/editor/facingArrow";
import { ev, frames, hasBrowser, launch, openEditor, sceneFile, sceneOf } from "../helpers/browser";

const plan = planCamera();

function area(a: Vec2, b: Vec2, c: Vec2): number {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
}

describe("facing arrow head (SPEC 10)", () => {
  it("is a triangle at the tip, not a second copy of the shaft", () => {
    const from: Vec3 = [1, 2, 0];
    const tip: Vec3 = [1 + FACING_SHAFT, 2, 0];
    const head = arrowHead(plan, from, tip, 2);
    expect(head).not.toBeNull();
    const [tipPoint, left, right] = head as readonly [Vec2, Vec2, Vec2];
    expect(tipPoint).toEqual(project(plan, tip[0], tip[1], 0));
    expect(area(tipPoint, left, right)).toBeGreaterThan(ARROW_HEAD);
    const shaft = [tipPoint[0] - project(plan, from[0], from[1], 0)[0], tipPoint[1] - project(plan, from[0], from[1], 0)[1]] as const;
    for (const wing of [left, right]) {
      const back = (wing[0] - tipPoint[0]) * shaft[0] + (wing[1] - tipPoint[1]) * shaft[1];
      expect(back).toBeLessThan(0);
      const side = Math.abs((wing[0] - tipPoint[0]) * shaft[1] - (wing[1] - tipPoint[1]) * shaft[0]);
      expect(side).toBeGreaterThan(0);
    }
  });

  it("fills the head", () => {
    const calls: string[] = [];
    const draw: ArrowDraw = {
      beginPath: () => calls.push("begin"),
      moveTo: (x, y) => calls.push(`move ${x},${y}`),
      lineTo: (x, y) => calls.push(`line ${x},${y}`),
      closePath: () => calls.push("close"),
      fill: () => calls.push("fill"),
    };
    expect(traceArrowHead(plan, [0, 0, 0], [FACING_SHAFT, 0, 0], 1, draw)).toBe(true);
    expect(calls[0]).toBe("begin");
    expect(calls.at(-2)).toBe("close");
    expect(calls.at(-1)).toBe("fill");
    expect(calls.filter((call) => call.startsWith("line"))).toHaveLength(2);
  });
});

const arrowScene = validateScene({
  schema: "isoblock/1",
  id: "arrow",
  units: { name: "u" },
  camera: { angleU: 30, angleV: 150, pxPerUnit: 50, verticalScale: 1, origin: [480, 120] },
  frame: { w: 1000, h: 700, regions: [{ id: "view", rect: [0, 0, 1000, 700] }] },
  types: {
    block: { size: [1, 1, 1], front: "+u" },
    mark: { size: [1, 1, 1] },
  },
  objects: [
    { id: "block", type: "block", pos: [0, 0] },
    { id: "mark", type: "mark", pos: [2, 0], locks: ["pos"] },
  ],
  relations: [{ id: "r1", rel: "facing", a: "block", b: "mark", angle: 30, hard: true }],
});

function arrowGreen(rgb: readonly number[]): boolean {
  const [r, g, b] = rgb;
  return Math.abs((r ?? 0) - 42) <= 30 && Math.abs((g ?? 0) - 125) <= 30 && Math.abs((b ?? 0) - 63) <= 30 && (g ?? 0) > (r ?? 0) + 20 && (g ?? 0) > (b ?? 0) + 20;
}

describe.skipIf(!hasBrowser)("facing arrow head on the plan view (SPEC 10)", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("paints the head beside the shaft, and the relations overlay data stays the relation results", async () => {
    const { page, errors } = await openEditor(browser, sceneFile("arrow.scene.json", arrowScene));
    try {
      for (const name of ["Frame regions", "Strips", "Lanes", "Zones"]) {
        await page.getByRole("checkbox", { name, exact: true }).uncheck();
      }
      await page.getByRole("checkbox", { name: "Relations", exact: true }).check();
      await frames(page, 3);
      const opened = await sceneOf(page);
      const overlay = await ev<{ results: unknown }>(page, 'window.isoblock.overlay("relations")');
      expect(overlay).toEqual({ results: evaluateRelations(opened).results });

      const sample = await wingPixel(page, opened);
      const wing = await pixels(page, sample.wing);
      const beside = await pixels(page, sample.beside);
      expect(wing.some(arrowGreen), `wing pixels ${JSON.stringify(wing)}`).toBe(true);
      expect(beside.some(arrowGreen), `line pixels ${JSON.stringify(beside)}`).toBe(false);
      expect(errors).toEqual([]);
    } finally {
      await page.context().close();
    }
  });
});

/** A point inside the head, off the shaft, and a point the same distance beside the relation line. */
async function wingPixel(page: Page, scene: Scene): Promise<{ wing: Vec2; beside: Vec2 }> {
  const figure = facingFigure(scene, resolveTarget(scene, "block"), resolveTarget(scene, "mark"));
  if (figure === null) throw new Error("facing figure missing");
  const from: Vec3 = [figure.from[0], figure.from[1], 0];
  const tip: Vec3 = [figure.from[0] + figure.front[0] * FACING_SHAFT, figure.from[1] + figure.front[1] * FACING_SHAFT, 0];
  const viewport = await ev<Viewport>(page, 'window.isoblock.viewport("plan")');
  const dpr = await ev<number>(page, 'window.isoblock.pixelRatio("plan")');
  const head = arrowHead(plan, from, tip, viewport.scale);
  if (head === null) throw new Error("arrow head missing");
  const [tipPoint, left, right] = head;
  const inside: Vec2 = [
    0.2 * tipPoint[0] + 0.6 * left[0] + 0.2 * right[0],
    0.2 * tipPoint[1] + 0.6 * left[1] + 0.2 * right[1],
  ];
  const mid = project(plan, (figure.from[0] + figure.to[0]) / 2, (figure.from[1] + figure.to[1]) / 2, 0);
  const off: Vec2 = [inside[0] - tipPoint[0], inside[1] - tipPoint[1]];
  const device = (point: Vec2): Vec2 => [
    Math.round(dpr * (viewport.scale * point[0] + viewport.tx)),
    Math.round(dpr * (viewport.scale * point[1] + viewport.ty)),
  ];
  return { wing: device(inside), beside: device([mid[0] + off[0], mid[1] + off[1]]) };
}

function pixels(page: Page, at: Vec2): Promise<number[][]> {
  const [x, y] = at;
  return ev<number[][]>(
    page,
    `(() => { const canvas = document.querySelector('figure.view[data-view="plan"] canvas'); const ctx = canvas.getContext('2d'); const out = []; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const p = ctx.getImageData(${x} + dx, ${y} + dy, 1, 1).data; out.push([p[0], p[1], p[2]]); } return out; })()`,
  );
}
