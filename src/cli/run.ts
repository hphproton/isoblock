import { runChecks } from "../core/checks";
import { runChecksInState } from "../core/checks/inState";
import { describeScene } from "../core/describe";
import { buildDisplayList } from "../core/displayList";
import { IsoblockError, exitCodeFor } from "../core/errors";
import { evaluateRelations } from "../core/relations/evaluate";
import { formatRelationsReport, relationsExitCode, relationsReportJson } from "../core/relations/report";
import { checkExitCode, checkReportJson, formatCheckReport } from "../core/report";
import { sceneInState } from "../core/states";
import type { Scene } from "../core/types";
import { parseScene, validateScene } from "../core/validate";
import { USAGE, parseArgs, type Parsed } from "./args";
import { runCompareCommand, runDiffCommand, runPatchCommand } from "./commands";
import { runExportCommand } from "./export";
import { runSolveCommand } from "./solve";
import type { Io } from "./io";
import { toSvg } from "./svg";
import { VERSION } from "./version";

export type { Io } from "./io";

type RunArgs = Extract<Parsed, { kind: "run" }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function printJson(io: Io, value: unknown): void {
  io.out(`${JSON.stringify(value, null, 2)}\n`);
}

/** Top-level `id` when the text is a JSON object with a string id, else null. */
function parsedId(text: string): { readonly id: string | null; readonly value?: unknown; readonly error?: IsoblockError } {
  try {
    const value: unknown = JSON.parse(text);
    const id = isRecord(value) && typeof value.id === "string" ? value.id : null;
    return { id, value };
  } catch (e) {
    return { id: null, error: new IsoblockError("E_JSON_PARSE", `malformed JSON: ${(e as Error).message}`) };
  }
}

function failJson(io: Io, error: IsoblockError, scene: string | null): number {
  printJson(io, { ok: false, scene, error: { code: error.code, message: error.message, details: [...error.details] } });
  return exitCodeFor(error.code);
}

/** `validate --json`: every outcome, an unreadable file included, is JSON on stdout (SPEC section 11). */
function validateJson(file: string, io: Io): number {
  let text: string;
  try {
    text = io.readText(file);
  } catch (e) {
    const error = e instanceof IsoblockError ? e : new IsoblockError("E_INTERNAL", e instanceof Error ? e.message : String(e));
    return failJson(io, error, null);
  }
  const parsed = parsedId(text);
  if (parsed.error !== undefined) return failJson(io, parsed.error, null);
  try {
    validateScene(parsed.value);
  } catch (e) {
    const error = e instanceof IsoblockError ? e : new IsoblockError("E_INTERNAL", e instanceof Error ? e.message : String(e));
    return failJson(io, error, parsed.id);
  }
  printJson(io, { ok: true, scene: parsed.id, error: null });
  return 0;
}

/** The scene with only the checks named by `--only`, in `checks` order. An unknown id is `E_USAGE`. */
function selectChecks(scene: Scene, only: readonly string[] | undefined): Scene {
  if (only === undefined) return scene;
  const known = new Set((scene.checks ?? []).map((c) => c.id));
  const unknown = only.filter((id) => !known.has(id));
  if (unknown.length > 0) throw new IsoblockError("E_USAGE", `unknown check "${unknown[0]}"`);
  const want = new Set(only);
  return { ...scene, checks: (scene.checks ?? []).filter((c) => want.has(c.id)) };
}

function execute(args: RunArgs, io: Io): number {
  if (args.command === "validate" && args.json) return validateJson(args.file, io);
  const scene = parseScene(io.readText(args.file));
  switch (args.command) {
    case "validate":
      io.out(`ok: ${args.file} is a valid isoblock/1 scene (id ${scene.id})\n`);
      return 0;
    case "check": {
      const selected = selectChecks(scene, args.only);
      const results = args.state === undefined ? runChecks(selected) : runChecksInState(selected, args.state);
      io.out(args.json ? `${JSON.stringify(checkReportJson(scene, results), null, 2)}\n` : `${formatCheckReport(scene, results, args.state)}\n`);
      return checkExitCode(results);
    }
    case "describe":
      io.out(`${describeScene(scene, runChecks(scene), { relations: args.relations === true, states: args.states === true })}\n`);
      return 0;
    case "relations": {
      const report = evaluateRelations(scene);
      io.out(args.json ? `${JSON.stringify(relationsReportJson(scene, report), null, 2)}\n` : `${formatRelationsReport(scene, report)}\n`);
      return relationsExitCode(report.results);
    }
    case "render": {
      const output = args.output as string;
      const list = buildDisplayList(sceneInState(scene, args.state));
      if (/\.png$/i.test(output)) {
        if (io.rasterize === undefined) throw new IsoblockError("E_INTERNAL", "no PNG rasterizer is available");
        io.writeBytes(output, io.rasterize(toSvg(list, { text: false })));
      } else {
        io.writeText(output, toSvg(list));
      }
      io.out(`wrote ${output}\n`);
      return 0;
    }
  }
}

function report(error: IsoblockError, io: Io): number {
  io.err([`error ${error.code}: ${error.message}`, ...error.details.map((d) => `  ${d}`)].join("\n") + "\n");
  return exitCodeFor(error.code);
}

/** Run the CLI with the given arguments (without the program name). Returns the exit code. */
export function run(argv: readonly string[], io: Io): number {
  try {
    const args = parseArgs(argv);
    if (args.kind === "help") {
      io.out(`${USAGE}\n`);
      return 0;
    }
    if (args.kind === "version") {
      io.out(`isoblock ${VERSION}\n`);
      return 0;
    }
    switch (args.kind) {
      case "patch":
        return runPatchCommand(args, io);
      case "diff":
        return runDiffCommand(args, io);
      case "compare":
        return runCompareCommand(args, io);
      case "solve":
        return runSolveCommand(args, io);
      case "export":
        return runExportCommand(args, io);
      default:
        return execute(args, io);
    }
  } catch (e) {
    if (e instanceof IsoblockError) return report(e, io);
    return report(new IsoblockError("E_INTERNAL", e instanceof Error ? e.message : String(e)), io);
  }
}
