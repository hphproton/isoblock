import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { measureCase } from "./compare";
import type { Box } from "./measure";

export interface Options {
  /** The Godot 4.7 binary (`GODOT`). */
  readonly godot: string;
  readonly root: string;
}

interface ExportCase {
  readonly name: string;
  readonly scene: string;
}

const SCREEN = "-screen 0 1280x1024x24";

/** Run a command, with its own virtual display when the environment has none. */
function runGodot(options: Options, work: string, script: string, args: readonly string[]): SpawnSyncReturns<string> {
  const godot = [
    options.godot, "--path", join(work, "project"), "--rendering-driver", "opengl3", "--audio-driver", "Dummy",
    "--script", `res://test/${script}.gd`, "--", ...args,
  ];
  const command = process.env.DISPLAY ? godot : ["xvfb-run", "-a", "-s", SCREEN, ...godot];
  return spawnSync(command[0] as string, command.slice(1), {
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 1 << 28,
    env: { ...process.env, XDG_DATA_HOME: join(work, "data"), XDG_CONFIG_HOME: join(work, "config"), XDG_CACHE_HOME: join(work, "cache") },
  });
}

function isoblock(root: string, args: readonly string[]): void {
  const r = spawnSync(process.execPath, [join(root, "dist", "isoblock.mjs"), ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`isoblock ${args.join(" ")} failed:\n${r.stderr}`);
}

function bytes(path: string): Buffer {
  return readFileSync(path);
}

/** Draw one case twice with the adapter and compare with the SVG of `render` (SPEC 13.6). */
function crossCheck(options: Options, work: string, c: ExportCase): string[] {
  const dir = join(work, c.name);
  mkdirSync(dir, { recursive: true });
  const scene = join(options.root, c.scene);
  isoblock(options.root, ["export", scene, "--target", "runtime", "-o", join(dir, "runtime.json")]);
  isoblock(options.root, ["render", scene, "-o", join(dir, "render.svg")]);
  const runtime = JSON.parse(readFileSync(join(dir, "runtime.json"), "utf8")) as { frame: { w: number; h: number }; objects: { id: string }[] };
  for (const run of ["one", "two"]) {
    const r = runGodot(options, work, "cross_check", ["--runtime", join(dir, "runtime.json"), "--out", join(dir, run)]);
    if (r.status !== 0 || !existsSync(join(dir, run, "alone.json"))) return [`Godot failed on ${c.name}:\n${r.stdout}\n${r.stderr}`];
  }
  const problems: string[] = [];
  for (const file of ["frame.png", "frame.rgba", "alone.json"]) {
    if (!bytes(join(dir, "one", file)).equals(bytes(join(dir, "two", file)))) problems.push(`${file} differs between two runs`);
  }
  const measure = measureCase({
    svg: readFileSync(join(dir, "render.svg"), "utf8"),
    ids: runtime.objects.map((o) => o.id),
    width: runtime.frame.w,
    height: runtime.frame.h,
    alone: JSON.parse(readFileSync(join(dir, "one", "alone.json"), "utf8")) as { id: string; box: Box | null }[],
    rgba: new Uint8Array(bytes(join(dir, "one", "frame.rgba"))),
  });
  console.log(
    `case ${c.name}: ${runtime.objects.length} objects, worst box edge ${measure.worstBox.toFixed(2)} px (limit 1)` +
      `${measure.worstObject === null ? "" : ` at ${measure.worstObject}`}, ` +
      `${measure.frameDifferences} frame pixels differ (limit ${measure.frameLimit}), runs ${problems.length === 0 ? "identical" : "DIFFER"}`,
  );
  return [...problems, ...measure.problems];
}

/** `npm run test:godot`: golden vectors, adapter tests and the cross-checks of SPEC 13.6. Returns the exit code. */
export function runGodotChecks(options: Options): number {
  const work = mkdtempSync(join(tmpdir(), "isoblock-godot-"));
  try {
    cpSync(join(options.root, "adapters", "godot"), join(work, "project"), { recursive: true, filter: (src) => !src.includes(`${"/"}.godot`) });
    const cases = (JSON.parse(readFileSync(join(options.root, "tests", "fixtures", "export", "cases.json"), "utf8")) as { cases: ExportCase[] }).cases;
    const garden = cases.find((c) => c.name === "garden") ?? (cases[0] as ExportCase);
    const sample = join(work, "sample.runtime.json");
    isoblock(options.root, ["export", join(options.root, garden.scene), "--target", "runtime", "-o", sample]);
    const adapter = runGodot(options, work, "adapter_test", ["--golden", join(options.root, "tests", "golden", "projection.json"), "--runtime", sample]);
    const line = /godot adapter: (\d+) checks, (\d+) failed/.exec(adapter.stdout);
    console.log(line === null ? "adapter tests: no result" : `adapter tests (golden vectors included): ${line[1]} checks, ${line[2]} failed`);
    const problems: string[] = [];
    if (adapter.status !== 0 || line === null || line[2] !== "0") problems.push(`adapter tests failed:\n${adapter.stdout}\n${adapter.stderr}`);
    for (const c of cases) problems.push(...crossCheck(options, work, c));
    for (const p of problems) console.error(`FAIL ${p}`);
    console.log(problems.length === 0 ? "godot checks passed" : `godot checks failed: ${problems.length} problems`);
    return problems.length === 0 ? 0 : 1;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
