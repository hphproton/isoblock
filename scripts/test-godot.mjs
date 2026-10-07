// `npm run test:godot`: the golden vectors and the cross-checks of SPEC 13.6 with the Godot adapter.
// Needs Godot 4.7.1 (GODOT names the binary) and Xvfb (or a DISPLAY). Not part of `npm test`.
import { build } from "esbuild";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const godot = process.env.GODOT;
if (!godot) {
  console.error("GODOT must name the Godot 4.7.1 binary, for example: GODOT=/opt/godot/Godot_v4.7.1-stable_linux.x86_64 npm run test:godot");
  process.exit(2);
}

const version = spawnSync(godot, ["--version"], { encoding: "utf8" });
if (version.status !== 0 || !/^4\.7\./.test(version.stdout.trim())) {
  console.error(`GODOT must name Godot 4.7; '${godot} --version' printed '${(version.stdout || version.stderr || String(version.error ?? "")).trim()}'`);
  process.exit(2);
}
console.log(`Godot ${version.stdout.trim()}`);

// The cross-check drives the built tool, so build it first.
execFileSync(process.execPath, [join(root, "scripts", "build.mjs")], { stdio: "inherit" });

// The runner is TypeScript, shared with the unit tests of its measures; bundle it to a temporary file.
const work = mkdtempSync(join(tmpdir(), "isoblock-godot-runner-"));
let code = 1;
try {
  const outfile = join(work, "run.mjs");
  await build({
    entryPoints: [join(root, "scripts", "godot", "run.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile,
    logLevel: "warning",
  });
  const { runGodotChecks } = await import(pathToFileURL(outfile).href);
  code = runGodotChecks({ godot, root });
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(code);
