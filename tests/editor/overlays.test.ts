import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { round6 } from "../../src/core/checks/result";
import { round } from "../../src/core/round";
import { hiddenObjects } from "../../src/core/states";
import type { CheckResult, Scene } from "../../src/core/types";
import { parseScene } from "../../src/core/validate";
import { dragMouse, ev, frames, hasBrowser, launch, openEditor, screenOf } from "../helpers/browser";
import { repoRoot } from "../helpers/fixtures";

const file = JSON.parse(readFileSync(join(repoRoot, "tests/fixtures/explain/editor/overlays.json"), "utf8")) as {
  cases: {
    name: string;
    scene: string;
    state: string | null;
    overlay: string | null;
    drag?: { object: string; dx: number; dy: number };
    only?: string | null;
    rotate?: boolean;
    then?: "Apply" | "Discard";
    check?: string;
    area?: string;
    actor?: string;
    step?: number;
  }[];
};

const cli = join(repoRoot, "dist/isoblock.mjs");

function runCli(args: readonly string[], input?: string): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", input });
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

function fixtureName(scene: string): string {
  return scene.replace(/^tests\/fixtures\//, "").replace(/\.scene\.json$/, "");
}

function scenePath(scene: string): string {
  return join(repoRoot, scene);
}

function shownState(scene: Scene, state: string | null): string | null {
  const name = state ?? "default";
  return Object.hasOwn(scene.states ?? {}, name) ? name : null;
}

function stateArgs(scene: Scene, state: string | null): string[] {
  const name = shownState(scene, state);
  return name === null ? [] : ["--state", name];
}

async function chooseState(page: Page, state: string | null): Promise<void> {
  if (state !== null) await page.locator("select[aria-label='State']").selectOption(state);
}

async function turnOn(page: Page, name: string): Promise<void> {
  await page.getByRole("checkbox", { name, exact: true }).check();
  await frames(page, 2);
}

async function saveText(page: Page): Promise<string> {
  await page.click("#save");
  return ev<string>(page, "window.isoblock.text()");
}

let browser: Browser;

beforeAll(async () => {
  if (hasBrowser) browser = await launch();
});

afterAll(async () => {
  await browser?.close();
});

describe.skipIf(!hasBrowser)("editor overlays (SPEC 10, 17)", () => {
  it("finds the 19 cases", () => {
    expect(file.cases).toHaveLength(19);
  });

  for (const c of file.cases) {
    it(c.name, async () => {
      const source = parseScene(readFileSync(scenePath(c.scene), "utf8"));
      const { page, context, errors } = await openEditor(browser, fixtureName(c.scene));
      await chooseState(page, c.state);
      const opened = await ev<string>(page, "window.isoblock.text()");
      if (c.overlay === "relations") await relationsCase(page, c, scenePath(c.scene));
      else if (c.overlay === "proposal") await proposalCase(page, c, scenePath(c.scene), opened);
      else if (c.overlay === "sortPoints") await sortCase(page, c, source);
      else if (c.overlay === "rays") await raysCase(page, c, source);
      else if (c.overlay === "masks") await masksCase(page, c, source);
      else if (c.overlay === "occluders") await occludersCase(page, c, source);
      else await warnCase(page, c, source);
      expect(errors, c.name).toEqual([]);
      await context.close();
    }, 60_000);
  }
});

async function drag(page: Page, object: string, dx: number, dy: number, stale: string): Promise<void> {
  const from = await screenOf(page, "plan", object);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(from[0] + (dx * i) / 8, from[1] + (dy * i) / 8);
    await frames(page, 1);
  }
  const names = await ev<string[]>(page, "window.isoblock.state().staleOverlays");
  expect(names).toContain(stale);
  await page.mouse.up();
  await frames(page, 2);
}

async function relationsCase(page: Page, c: (typeof file.cases)[number], path: string): Promise<void> {
  await turnOn(page, "Relations");
  await expectRelations(page, JSON.parse(runCli(["relations", "--json", path]).stdout).results);
  if (c.drag !== undefined) {
    await dragMouse(page, await screenOf(page, "plan", c.drag.object), [
      (await screenOf(page, "plan", c.drag.object))[0] + c.drag.dx,
      (await screenOf(page, "plan", c.drag.object))[1] + c.drag.dy,
    ]);
    const saved = await saveText(page);
    const dir = mkdtempSync(join(tmpdir(), "isoblock-rel-"));
    try {
      const filePath = join(dir, "scene.json");
      writeFileSync(filePath, saved);
      await expectRelations(page, JSON.parse(runCli(["relations", "--json", filePath]).stdout).results);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

async function expectRelations(page: Page, results: { id: string; status: string }[]): Promise<void> {
  const overlay = await ev<{ results: { id: string; status: string }[] }>(page, 'window.isoblock.overlay("relations")');
  expect(overlay.results).toEqual(results);
  const rows = await page.locator("#relations-list button").evaluateAll((nodes) =>
    nodes.map((node) => ({ id: node.getAttribute("data-relation"), status: node.getAttribute("data-status") })),
  );
  expect(rows).toEqual(results.map((row) => ({ id: row.id, status: row.status })));
}

async function proposalCase(page: Page, c: (typeof file.cases)[number], path: string, opened: string): Promise<void> {
  if (c.only) {
    const at = await screenOf(page, "plan", c.only);
    await page.mouse.click(at[0], at[1]);
    await page.getByRole("checkbox", { name: "Only the selected object", exact: true }).check();
  }
  if (c.rotate === true) await page.getByRole("checkbox", { name: "Turn objects", exact: true }).check();
  else if (c.rotate === false) await page.getByRole("checkbox", { name: "Turn objects", exact: true }).uncheck();
  await page.getByRole("button", { name: "Solve", exact: true }).click();
  const args = ["solve", "--json", path, ...(c.only ? ["--only", c.only] : []), ...(c.rotate ? ["--rotate"] : [])];
  const want = JSON.parse(runCli(args).stdout) as { status: string; conflict: string[]; moved: unknown[] };
  expect(await ev(page, 'window.isoblock.overlay("proposal")')).toEqual(want);
  if (want.status === "conflict") {
    const marked = await page.locator("#relations-list button").evaluateAll((nodes) =>
      nodes.map((node) => ({ id: node.getAttribute("data-relation") ?? "", conflict: node.getAttribute("data-conflict") === "true" })),
    );
    const ids = new Set(want.conflict);
    for (const row of marked) expect(row.conflict, row.id).toBe(ids.has(row.id));
  }
  await page.getByRole("button", { name: c.then ?? "Apply", exact: true }).click();
  const saved = await saveText(page);
  if (c.then === "Discard") {
    expect(saved).toBe(opened);
    expect(await ev(page, 'window.isoblock.overlay("proposal")')).toBeNull();
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "isoblock-solve-"));
  try {
    const source = join(dir, "scene.json");
    const out = join(dir, "out.json");
    writeFileSync(source, readFileSync(path));
    const solveArgs = ["solve", source, "--patch", "-", ...(c.only ? ["--only", c.only] : []), ...(c.rotate ? ["--rotate"] : [])];
    const patch = runCli(solveArgs);
    expect(patch.status === 0 || patch.status === 1, patch.stderr).toBe(true);
    const applied = runCli(["patch", source, "-", "-o", out], patch.stdout);
    expect(applied.status === 0 || applied.status === 1).toBe(true);
    expect(saved).toBe(readFileSync(out, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await frames(page, 1);
  expect(await ev<string>(page, "window.isoblock.text()")).toBe(opened);
}

async function sortCase(page: Page, c: (typeof file.cases)[number], scene: Scene): Promise<void> {
  await turnOn(page, "Sort points");
  const runtime = JSON.parse(runCli(["export", "--target", "runtime", scenePath(c.scene)]).stdout) as {
    objects: { id: string; base: number; sprites: { key: number; footprint: number[] }[] }[];
  };
  const overlay = await ev<{ sprites: { object: string; key: number; point: number[] }[] }>(page, 'window.isoblock.overlay("sortPoints")');
  const name = shownState(scene, c.state);
  const hidden = name === null ? new Set<string>() : hiddenObjects(scene, name);
  for (const object of runtime.objects) {
    const rows = overlay.sprites.filter((row) => row.object === object.id);
    if (hidden.has(object.id)) {
      expect(rows, object.id).toEqual([]);
      continue;
    }
    expect(rows.map((row) => row.key), object.id).toEqual(object.sprites.map((sprite) => sprite.key));
    rows.forEach((row, index) => {
      const foot = object.sprites[index]?.footprint ?? [];
      const point = [round(((foot[0] ?? 0) + (foot[2] ?? 0)) / 2, 6), round(((foot[1] ?? 0) + (foot[3] ?? 0)) / 2, 6), round(object.base, 6)];
      expect(row.point, `${object.id} ${index}`).toEqual(point);
    });
  }
}

async function raysCase(page: Page, c: (typeof file.cases)[number], scene: Scene): Promise<void> {
  await turnOn(page, "Occlusion rays");
  await page.locator(`#checks-list button.check[data-check="${c.check ?? ""}"]`).click();
  await frames(page, 1);
  const rays = await ev<{ check: string | null; samples: { occluded: boolean; by: string[] }[] }>(page, 'window.isoblock.overlay("rays")');
  const report = JSON.parse(runCli(["check", "--json", scenePath(c.scene), ...stateArgs(scene, c.state)]).stdout) as { results: CheckResult[] };
  const result = report.results.find((row) => row.id === c.check);
  expect(rays.check).toBe(c.check);
  expect(rays.samples.length % 64).toBe(0);
  expect(rays.samples.length).toBeGreaterThan(0);
  const occluded = rays.samples.filter((sample) => sample.occluded).length;
  expect(round6(occluded / rays.samples.length)).toBe(result?.value);
  expect(new Set(rays.samples.flatMap((sample) => sample.by))).toEqual(new Set(result?.occluders ?? []));
}

async function masksCase(page: Page, c: (typeof file.cases)[number], scene: Scene): Promise<void> {
  await turnOn(page, "Masks");
  if (c.drag !== undefined) await drag(page, c.drag.object, c.drag.dx, c.drag.dy, "masks");
  const saved = await saveText(page);
  const dir = mkdtempSync(join(tmpdir(), "isoblock-mask-"));
  try {
    const filePath = join(dir, "scene.json");
    writeFileSync(filePath, c.drag === undefined ? readFileSync(scenePath(c.scene)) : saved);
    const report = JSON.parse(runCli(["visibility", "--json", filePath, ...stateArgs(scene, c.state)]).stdout);
    expect(await ev(page, 'window.isoblock.overlay("masks")')).toEqual(report);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function occludersCase(page: Page, c: (typeof file.cases)[number], scene: Scene): Promise<void> {
  await page.locator("select[aria-label='Occluders of']").selectOption(c.area ?? "");
  await page.locator("[aria-label='Actor size']").fill(c.actor ?? "");
  await page.locator("[aria-label='Occluder step']").fill(String(c.step));
  await frames(page, 2);
  const area = c.area ?? "";
  const flag = area.startsWith("zone:") ? "--zone" : "--lane";
  const command = runCli([
    "occluders", "--json", scenePath(c.scene), "--actor", c.actor ?? "", "--step", String(c.step),
    flag, area.slice(area.indexOf(":") + 1), ...stateArgs(scene, c.state),
  ]);
  if (c.drag !== undefined && command.status !== 2) await drag(page, c.drag.object, c.drag.dx, c.drag.dy, "occluders");
  if (command.status === 2) {
    expect(await ev(page, 'window.isoblock.overlay("occluders")')).toBeNull();
    expect(((await page.locator("#status").textContent()) ?? "").trim()).not.toBe("");
    return;
  }
  const saved = c.drag === undefined ? readFileSync(scenePath(c.scene), "utf8") : await saveText(page);
  const dir = mkdtempSync(join(tmpdir(), "isoblock-occ-"));
  try {
    const filePath = join(dir, "scene.json");
    writeFileSync(filePath, saved);
    const report = JSON.parse(runCli([
      "occluders", "--json", filePath, "--actor", c.actor ?? "", "--step", String(c.step),
      flag, area.slice(area.indexOf(":") + 1), ...stateArgs(scene, c.state),
    ]).stdout);
    expect(await ev(page, 'window.isoblock.overlay("occluders")')).toEqual(report);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const pathsFile = JSON.parse(readFileSync(join(repoRoot, "tests/fixtures/paths/editor/overlays.json"), "utf8")) as typeof file;

describe.skipIf(!hasBrowser)("path editor overlays (SPEC 10, 17)", () => {
  it("finds the 8 cases", () => {
    expect(pathsFile.cases).toHaveLength(8);
  });

  for (const c of pathsFile.cases) {
    it(c.name, async () => {
      const source = parseScene(readFileSync(scenePath(c.scene), "utf8"));
      const { page, context, errors } = await openEditor(browser, fixtureName(c.scene));
      await chooseState(page, c.state);
      const opened = await ev<string>(page, "window.isoblock.text()");
      if (c.overlay === "relations") await relationsCase(page, c, scenePath(c.scene));
      else if (c.overlay === "proposal") await proposalCase(page, c, scenePath(c.scene), opened);
      else if (c.overlay === "sortPoints") await sortCase(page, c, source);
      else if (c.overlay === "rays") await raysCase(page, c, source);
      else if (c.overlay === "masks") await masksCase(page, c, source);
      else if (c.overlay === "occluders") await occludersCase(page, c, source);
      else await warnCase(page, c, source);
      expect(errors, c.name).toEqual([]);
      await context.close();
    }, 60_000);
  }
});

async function warnCase(page: Page, c: (typeof file.cases)[number], scene: Scene): Promise<void> {
  const rows = await page.locator("#checks-list button.check").evaluateAll((nodes) =>
    nodes.map((node) => ({ id: node.getAttribute("data-check"), status: node.getAttribute("data-status") })),
  );
  const report = JSON.parse(runCli(["check", "--json", scenePath(c.scene), ...stateArgs(scene, c.state)]).stdout) as { results: CheckResult[] };
  expect(rows).toEqual(report.results.map((result) => ({ id: result.id, status: result.status })));
}
