import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { actorDifferences, sceneWithActor } from "./actor";
import { measureCase } from "./compare";
import type { Box } from "./measure";

export interface Options {
  /** The Godot 4.7 binary (`GODOT`). */
  readonly godot: string;
  readonly root: string;
}

/**
 * One cross-check (SPEC 13.6): a case of `tests/fixtures/godot/cases.json` (SPEC 17), or an export
 * case, which is drawn once in the default state, without instances or an actor.
 */
export interface GodotCase {
  readonly name: string;
  readonly scene: string;
  readonly states: readonly (string | null)[];
  readonly instantiate: readonly string[] | null;
  readonly unmapped: readonly string[] | null;
  readonly actor: { readonly size: readonly [number, number, number]; readonly path: readonly (readonly [number, number])[] } | null;
}

interface GodotCases {
  readonly actorLimit: number;
  readonly cases: readonly GodotCase[];
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

/**
 * A GDScript runtime error does not stop the script: it leaves the current function, and the checks
 * after it never run. Any such error in a run is a failure.
 */
function scriptErrors(r: SpawnSyncReturns<string>): string[] {
  return `${r.stdout}\n${r.stderr}`.split("\n").filter((line) => line.startsWith("SCRIPT ERROR"));
}

function isoblock(root: string, args: readonly string[]): void {
  const r = spawnSync(process.execPath, [join(root, "dist", "isoblock.mjs"), ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`isoblock ${args.join(" ")} failed:\n${r.stderr}`);
}

function bytes(path: string): Buffer {
  return readFileSync(path);
}

/** The SVG of `render` for a scene file, in a state (`null` for the default). */
function render(root: string, scene: string, state: string | null, out: string): string {
  isoblock(root, ["render", scene, ...(state === null ? [] : ["--state", state]), "-o", out]);
  return readFileSync(out, "utf8");
}

/** The files of the two runs: the same names, the same bytes. */
function sameRuns(one: string, two: string): string[] {
  const names = readdirSync(one).sort();
  if (names.join("\n") !== readdirSync(two).sort().join("\n")) return ["the two runs wrote different files"];
  return names.filter((n) => !bytes(join(one, n)).equals(bytes(join(two, n)))).map((n) => `${n} differs between two runs`);
}

/**
 * Draw one case twice with the adapter: each state of `states` in order, then the actor along its
 * path in the last state. Compare every frame with the SVG of `render` (SPEC 13.6).
 */
function crossCheck(options: Options, work: string, label: string, c: GodotCase, actorLimit: number): string[] {
  const dir = join(work, label.replace(/[^A-Za-z0-9]+/g, "-"));
  mkdirSync(dir, { recursive: true });
  const scene = join(options.root, c.scene);
  isoblock(options.root, ["export", scene, "--target", "runtime", "-o", join(dir, "runtime.json")]);
  writeFileSync(join(dir, "case.json"), JSON.stringify({ states: c.states, instantiate: c.instantiate, actor: c.actor }));
  const runtime = JSON.parse(readFileSync(join(dir, "runtime.json"), "utf8")) as { frame: { w: number; h: number }; objects: { id: string }[] };
  const ids = runtime.objects.map((o) => o.id);
  const { w: width, h: height } = runtime.frame;
  for (const run of ["one", "two"]) {
    const args = ["--runtime", join(dir, "runtime.json"), "--case", join(dir, "case.json"), "--out", join(dir, run)];
    const r = runGodot(options, work, "cross_check", args);
    if (r.status !== 0 || !existsSync(join(dir, run, "build.json")) || scriptErrors(r).length > 0) {
      return [`Godot failed on ${label}:\n${r.stdout}\n${r.stderr}`];
    }
  }
  const out = join(dir, "one");
  const problems = sameRuns(out, join(dir, "two"));
  const unmapped = (JSON.parse(readFileSync(join(out, "build.json"), "utf8")) as { unmapped: string[] }).unmapped;
  const want = c.instantiate === null ? [] : c.unmapped;
  if (JSON.stringify(unmapped) !== JSON.stringify(want)) problems.push(`${label}: build returned unmapped ${JSON.stringify(unmapped)}, expected ${JSON.stringify(want)}`);

  let without = 0;
  c.states.forEach((state, k) => {
    const name = state ?? "default";
    const measure = measureCase({
      svg: render(options.root, scene, state, join(dir, `step-${k}.svg`)),
      ids,
      width,
      height,
      alone: JSON.parse(readFileSync(join(out, `step-${k}.alone.json`), "utf8")) as { id: string; box: Box | null }[],
      rgba: new Uint8Array(bytes(join(out, `step-${k}.rgba`))),
    });
    console.log(
      `case ${label}, state ${name}: ${ids.length} objects, worst box edge ${measure.worstBox.toFixed(2)} px (limit 1)` +
        `${measure.worstObject === null ? "" : ` at ${measure.worstObject}`}, ` +
        `${measure.frameDifferences} frame pixels differ (limit ${measure.frameLimit})`,
    );
    problems.push(...measure.problems.map((p) => `${label}, state ${name}: ${p}`));
    without = measure.frameDifferences;
  });

  if (c.actor !== null) {
    const actor = c.actor;
    const state = c.states[c.states.length - 1] ?? null;
    const text = readFileSync(scene, "utf8");
    const extras = actor.path.map((at, j) => {
      const file = join(dir, `actor-${j}.scene.json`);
      writeFileSync(file, sceneWithActor(text, actor.size, at));
      const svg = render(options.root, file, state, join(dir, `actor-${j}.svg`));
      const extra = actorDifferences({ svg, rgba: new Uint8Array(bytes(join(out, `actor-${j}.rgba`))) }, ids, width, height) - without;
      if (extra > actorLimit) problems.push(`${label}, actor at ${JSON.stringify(at)}: ${extra} more pixels differ than without the actor (limit ${actorLimit})`);
      return extra;
    });
    console.log(`case ${label}, actor in state ${state ?? "default"}: ${actor.path.length} positions, more pixels than without the actor: ${extras.join(", ")} (limit ${actorLimit})`);
  }
  console.log(`case ${label}: runs ${problems.some((p) => /between two runs|different files/.test(p)) ? "DIFFER" : "identical"}`);
  return problems;
}

/** `npm run test:godot`: golden vectors, adapter tests and the cross-checks of SPEC 13.6. Returns the exit code. */
export function runGodotChecks(options: Options): number {
  const work = mkdtempSync(join(tmpdir(), "isoblock-godot-"));
  try {
    cpSync(join(options.root, "adapters", "godot"), join(work, "project"), { recursive: true, filter: (src) => !src.includes(`${"/"}.godot`) });
    const fixtures = join(options.root, "tests", "fixtures");
    const exportCases = (JSON.parse(readFileSync(join(fixtures, "export", "cases.json"), "utf8")) as { cases: { name: string; scene: string }[] }).cases;
    const godot = JSON.parse(readFileSync(join(fixtures, "godot", "cases.json"), "utf8")) as GodotCases;
    // The adapter's own tests run on `walk`: anchors, zones, lanes, states and sliced objects.
    const sample = join(work, "sample.runtime.json");
    isoblock(options.root, ["export", join(fixtures, "gameplay", "walk.scene.json"), "--target", "runtime", "-o", sample]);
    const golden = join(options.root, "tests", "golden");
    const adapter = runGodot(options, work, "adapter_test", ["--golden", join(golden, "projection.json"), "--sort", join(golden, "sort.json"), "--runtime", sample]);
    const line = /godot adapter: (\d+) checks, (\d+) failed/.exec(adapter.stdout);
    console.log(line === null ? "adapter tests: no result" : `adapter tests (golden vectors and sort keys included): ${line[1]} checks, ${line[2]} failed`);
    const problems: string[] = [];
    const errors = scriptErrors(adapter);
    if (adapter.status !== 0 || line === null || line[2] !== "0" || errors.length > 0) {
      problems.push(`adapter tests failed${errors.length > 0 ? ` (${errors.join("; ")})` : ""}:\n${adapter.stdout}\n${adapter.stderr}`);
    }
    for (const c of exportCases) {
      const plain: GodotCase = { name: c.name, scene: c.scene, states: [null], instantiate: null, unmapped: null, actor: null };
      problems.push(...crossCheck(options, work, `export ${c.name}`, plain, godot.actorLimit));
    }
    for (const c of godot.cases) problems.push(...crossCheck(options, work, `godot ${c.name}`, c, godot.actorLimit));
    for (const p of problems) console.error(`FAIL ${p}`);
    console.log(problems.length === 0 ? "godot checks passed" : `godot checks failed: ${problems.length} problems`);
    return problems.length === 0 ? 0 : 1;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
