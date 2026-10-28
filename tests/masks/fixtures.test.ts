import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/run";
import { memoryIo } from "../helpers/cli";
import { repoRoot } from "../helpers/fixtures";
import { decodeGrayPng, type GrayImage } from "../helpers/png";

const masksDir = join(repoRoot, "tests/fixtures/masks");
const file = JSON.parse(readFileSync(join(masksDir, "cases.json"), "utf8")) as {
  readonly tolerance: { readonly pixels: number; readonly labelPixels: number; readonly share: number; readonly box: number; readonly area: number };
  readonly masks: readonly { readonly name: string; readonly scene: string; readonly state: string | null; readonly grow: number; readonly expected: string }[];
  readonly visibility: readonly { readonly name: string; readonly scene: string; readonly state: string | null; readonly region: string | null; readonly expected: string }[];
  readonly occluders: readonly {
    readonly name: string;
    readonly scene: string;
    readonly state: string | null;
    readonly lane?: string;
    readonly zone?: string;
    readonly actor: readonly [number, number, number];
    readonly step: number;
    readonly expected: string;
  }[];
  readonly checks: readonly { readonly scene: string; readonly state: string | null; readonly checks: readonly Record<string, unknown>[] }[];
};

function stateArgs(state: string | null): string[] {
  return state === null ? [] : ["--state", state];
}

function compareValue(actual: unknown, expected: unknown, path: string, tol: typeof file.tolerance): void {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    const list = actual as unknown[];
    expect(list.length, path).toBe(expected.length);
    const limit = path.endsWith("box") ? tol.box : path.endsWith("actor") ? 0 : null;
    expected.forEach((item, i) => {
      if (limit !== null && typeof item === "number") {
        expect(Math.abs((list[i] as number) - item), `${path}[${i}]`).toBeLessThanOrEqual(limit);
      } else {
        compareValue(list[i], item, `${path}[${i}]`, tol);
      }
    });
    return;
  }
  if (expected !== null && typeof expected === "object") {
    expect(Object.keys(actual as object), path).toEqual(Object.keys(expected));
    for (const key of Object.keys(expected)) {
      compareValue((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${path}.${key}`, tol);
    }
    return;
  }
  if (typeof expected === "number") {
    const limit = path.endsWith(".region.pixels")
      ? 0
      : /(?:^|\.)(?:pixels|covered|full|visible)$/.test(path)
      ? tol.pixels
      : /(?:share|cover)$/.test(path)
        ? tol.share
        : path.endsWith("area")
          ? tol.area
          : 0;
    expect(typeof actual, path).toBe("number");
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(limit);
    return;
  }
  expect(actual, path).toEqual(expected);
}

function differ(a: Uint16Array, b: Uint16Array): number {
  expect(a.length).toBe(b.length);
  let count = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count += 1;
  return count;
}

function place(frameW: number, frameH: number, box: readonly number[], image: GrayImage): Uint16Array {
  const [x0, y0, x1, y1] = box;
  expect(image.width, "image width").toBe(x1 - x0);
  expect(image.height, "image height").toBe(y1 - y0);
  const canvas = new Uint16Array(frameW * frameH);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) canvas[(y0 + y) * frameW + (x0 + x)] = image.samples[y * image.width + x] as number;
  }
  return canvas;
}

function readExpected(name: string): unknown {
  return JSON.parse(readFileSync(join(masksDir, name), "utf8"));
}

describe("mask fixtures (SPEC 14.1, 11.3, 11.4, 17)", () => {
  for (const c of file.masks) {
    it(`${c.name}: export --target masks matches ${c.expected}`, () => {
      const scene = join(repoRoot, c.scene);
      const args = ["export", scene, "--target", "masks", "-o", "out", "--grow", String(c.grow), ...stateArgs(c.state)];
      const first = memoryIo();
      const second = memoryIo();
      expect(run(args, first.io), first.err()).toBe(0);
      expect(run(args, second.io)).toBe(0);
      expect(first.files.get("out/masks.json")).toBe(second.files.get("out/masks.json"));
      expect(Buffer.from(first.bytes.get("out/labels.png") as Uint8Array).equals(Buffer.from(second.bytes.get("out/labels.png") as Uint8Array))).toBe(true);
      const actual = JSON.parse(first.files.get("out/masks.json") as string) as {
        frame: { w: number; h: number };
        objects: { full: { file: string; box: number[] } | null; visible: { file: string } | null }[];
        groups: { full: { file: string; box: number[] } | null; visible: { file: string } | null }[];
      };
      const expected = readExpected(join(c.expected, "masks.json")) as typeof actual;
      compareValue(actual, expected, c.name, file.tolerance);
      const actualLabels = decodeGrayPng(first.bytes.get("out/labels.png") as Uint8Array);
      const expectedLabels = decodeGrayPng(readFileSync(join(masksDir, c.expected, "labels.png")));
      expect(differ(actualLabels.samples, expectedLabels.samples), "labels").toBeLessThanOrEqual(file.tolerance.labelPixels);
      const images = [
        ...actual.objects.flatMap((object, i) => (object.full === null ? [] : [[object, expected.objects[i]] as const])),
        ...actual.groups.flatMap((group, i) => (group.full === null ? [] : [[group, expected.groups[i]] as const])),
      ];
      for (const [got, want] of images) {
        for (const kind of ["full", "visible"] as const) {
          const name = (got[kind] as { file: string }).file;
          const gotImage = decodeGrayPng(first.bytes.get(join("out", ...name.split("/"))) as Uint8Array);
          const wantImage = decodeGrayPng(readFileSync(join(masksDir, c.expected, name)));
          const gotCanvas = place(actual.frame.w, actual.frame.h, got.full?.box as number[], gotImage);
          const wantCanvas = place(expected.frame.w, expected.frame.h, want?.full?.box as number[], wantImage);
          expect(differ(gotCanvas, wantCanvas), name).toBeLessThanOrEqual(file.tolerance.pixels);
        }
      }
    });
  }

  for (const c of file.visibility) {
    it(`${c.name}: visibility --json matches ${c.expected}`, () => {
      const cap = memoryIo();
      const args = ["visibility", join(repoRoot, c.scene), "--json", ...stateArgs(c.state), ...(c.region === null ? [] : ["--region", c.region])];
      expect(run(args, cap.io), cap.err()).toBe(0);
      compareValue(JSON.parse(cap.out()), readExpected(c.expected), c.name, file.tolerance);
    });
  }

  for (const c of file.occluders) {
    it(`${c.name}: occluders --json matches ${c.expected}`, () => {
      const cap = memoryIo();
      const area = c.lane !== undefined ? ["--lane", c.lane] : ["--zone", c.zone as string];
      const args = [
        "occluders", join(repoRoot, c.scene), "--json", "--actor", c.actor.join(","), "--step", String(c.step),
        ...area, ...stateArgs(c.state),
      ];
      expect(run(args, cap.io), cap.err()).toBe(0);
      compareValue(JSON.parse(cap.out()), readExpected(c.expected), c.name, file.tolerance);
    });
  }

  for (const c of file.checks) {
    it(`check ${c.scene} state ${c.state ?? "default"} exits by the visible_share results`, () => {
      const cap = memoryIo();
      const code = run(["check", join(repoRoot, c.scene), "--json", ...stateArgs(c.state)], cap.io);
      const failing = c.checks.some((row) => row.status === "fail" || row.status === "skip");
      expect(code).toBe(failing ? 1 : 0);
      const report = JSON.parse(cap.out()) as { results: { id: string }[] };
      expect(report.results.map((row) => row.id)).toEqual(c.checks.map((row) => row.id));
    });
  }
});

describe("mask command usage", () => {
  const plaza = join(repoRoot, "tests/fixtures/masks/plaza.scene.json");

  it("rejects masks without -o, a bad grow, and bbox flags on masks", () => {
    for (const [argv, pattern] of [
      [["export", plaza, "--target", "masks"], /needs -o/],
      [["export", plaza, "--target", "masks", "-o", "out", "--grow", "65"], /0 to 64/],
      [["export", plaza, "--target", "gen-bbox", "--grow", "1"], /--grow applies to the masks target only/],
      [["export", plaza, "--target", "masks", "-o", "out", "--bbox-units", "px"], /gen-bbox target only/],
      [["visibility", plaza, "--region", "focs"], /unknown region 'focs'/],
      [["occluders", plaza, "--actor", "0.5,0.5,1.7"], /exactly one of --lane and --zone/],
      [["occluders", plaza, "--actor", "0.5,0.5,1.7", "--lane", "walk", "--zone", "square"], /exactly one of --lane and --zone/],
      [["visibility", plaza, "--region", "focus", "--state", "quiet"], /hidden in state 'quiet'/],
    ] as const) {
      const cap = memoryIo();
      expect(run([...argv], cap.io), argv.join(" ")).toBe(2);
      expect(cap.err(), argv.join(" ")).toMatch(pattern);
    }
  });
});
