import { compareVariants } from "../core/compare/compare";
import { compareJson, formatCompareMarkdown, formatCompareText } from "../core/compare/format";
import { diffReportJson, diffScenes, formatDiff } from "../core/diff";
import { runPatch, type PatchOutcome } from "../core/patch/outcome";
import { formatPatchReport, patchExitCode, patchLogLine, patchReportJson } from "../core/patch/report";
import { serializeScene } from "../core/serialize";
import { parseScene } from "../core/validate";
import type { Parsed } from "./args";
import type { Io } from "./io";

type Of<K extends Parsed["kind"]> = Extract<Parsed, { kind: K }>;

function printJson(io: Io, value: unknown): void {
  io.out(`${JSON.stringify(value, null, 2)}\n`);
}

/** The patch log of an output file: `<file without .json>.log.jsonl`. */
export function logPathFor(output: string): string {
  return `${output.replace(/\.json$/, "")}.log.jsonl`;
}

function baseName(path: string): string {
  return path.slice(path.search(/[^/\\]*$/));
}

/** Add one line to the patch log; `seq` counts the lines of the log from 1. */
function appendLog(io: Io, output: string, patchFile: string, outcome: PatchOutcome): void {
  const path = logPathFor(output);
  const existing = io.exists(path) ? io.readText(path) : "";
  const seq = existing.split("\n").filter((line) => line.trim() !== "").length + 1;
  const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
  io.appendText(path, `${separator}${patchLogLine(seq, baseName(patchFile), outcome)}\n`);
}

/**
 * `patch`: apply a patch file to a scene. The result goes to `-o` or back to the scene file; an
 * applied or lock-rejected patch is added to the log; a dry run, a rejected patch and an
 * invalid patch write no scene file.
 */
export function runPatchCommand(args: Of<"patch">, io: Io): number {
  const scene = parseScene(io.readText(args.file));
  const outcome = runPatch(scene, io.readText(args.patchFile));
  const target = args.output ?? args.file;
  const notes: string[] = [];
  if (args.dryRun) {
    notes.push("dry run: nothing written");
  } else {
    if (outcome.result !== null) {
      io.writeText(target, serializeScene(outcome.result));
      notes.push(`wrote ${target}`);
    }
    if (outcome.status !== "invalid") appendLog(io, target, args.patchFile, outcome);
  }
  if (args.json) printJson(io, patchReportJson(outcome));
  else io.out(`${[formatPatchReport(outcome), ...notes].join("\n")}\n`);
  return patchExitCode(outcome);
}

/** `diff`: list the changes from one scene file to another. */
export function runDiffCommand(args: Of<"diff">, io: Io): number {
  const a = parseScene(io.readText(args.file));
  const b = parseScene(io.readText(args.other));
  const changes = diffScenes(a, b);
  if (args.json) printJson(io, diffReportJson(a, b, changes));
  else io.out(`${formatDiff(a, b, changes)}\n`);
  return 0;
}

/** `compare`: measure the scene and its variants side by side. Exits 0 when it completes. */
export function runCompareCommand(args: Of<"compare">, io: Io): number {
  const scene = parseScene(io.readText(args.file));
  const comparison = compareVariants(scene, args.variants.map((v) => ({ name: v.name, text: io.readText(v.file) })), args.state);
  if (args.format === "json") printJson(io, compareJson(comparison));
  else io.out(`${args.format === "md" ? formatCompareMarkdown(comparison) : formatCompareText(comparison)}\n`);
  return 0;
}
