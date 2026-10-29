import { resolve } from "node:path";
import { runChecks } from "../core/checks";
import { IsoblockError } from "../core/errors";
import { serializeScene } from "../core/serialize";
import { formatSolveReport, solveExitCode, solvePatch, solveReportJson } from "../core/solver/report";
import { solveScene } from "../core/solver/solve";
import { parseScene } from "../core/validate";
import type { Parsed } from "./args";
import type { Io } from "./io";

type SolveArgs = Extract<Parsed, { kind: "solve" }>;

function usage(message: string): IsoblockError {
  return new IsoblockError("E_USAGE", message, ["Try 'isoblock --help'."]);
}

/** The input file is never written, and the two outputs are different files. `--patch -` is standard output. */
function checkOutputs(args: SolveArgs): void {
  const input = resolve(args.file);
  const patchFile = args.patchOutput === "-" ? undefined : args.patchOutput;
  for (const out of [args.output, patchFile]) {
    if (out !== undefined && resolve(out) === input) throw usage("solve never writes its input file: choose another output name");
  }
  if (args.output !== undefined && patchFile !== undefined && resolve(args.output) === resolve(patchFile)) {
    throw usage("-o and --patch must name different files");
  }
}

/**
 * `solve`: propose positions for the movable objects (SPEC section 8). `-o` writes the proposal
 * as a scene file, `--patch` writes it as a short-command patch; the input file is never written.
 */
export function runSolveCommand(args: SolveArgs, io: Io): number {
  checkOutputs(args);
  const scene = parseScene(io.readText(args.file));
  const { report, proposal } = solveScene(scene, args.only, args.rotate === true);
  const patch = args.patchOutput === undefined ? undefined : solvePatch(scene, report);
  const toStdout = args.patchOutput === "-";
  const notes: string[] = [];
  if (args.output !== undefined) {
    io.writeText(args.output, serializeScene(proposal));
    if (!toStdout) notes.push(`wrote ${args.output}`);
  }
  if (patch !== undefined && args.patchOutput !== undefined && !toStdout) {
    io.writeText(args.patchOutput, patch);
    notes.push(`wrote ${args.patchOutput}`);
  }
  if (toStdout) {
    io.out(patch as string);
    return solveExitCode(report, runChecks(proposal));
  }
  if (args.json) io.out(`${JSON.stringify(solveReportJson(report), null, 2)}\n`);
  else io.out(`${[formatSolveReport(report), ...notes].join("\n")}\n`);
  return solveExitCode(report, runChecks(proposal));
}
