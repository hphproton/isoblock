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

/** The input file is never written, and the two outputs are different files. */
function checkOutputs(args: SolveArgs): void {
  const input = resolve(args.file);
  for (const out of [args.output, args.patchOutput]) {
    if (out !== undefined && resolve(out) === input) throw usage("solve never writes its input file: choose another output name");
  }
  if (args.output !== undefined && args.patchOutput !== undefined && resolve(args.output) === resolve(args.patchOutput)) {
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
  const { report, proposal } = solveScene(scene, args.only);
  const notes: string[] = [];
  if (args.output !== undefined) {
    io.writeText(args.output, serializeScene(proposal));
    notes.push(`wrote ${args.output}`);
  }
  if (args.patchOutput !== undefined) {
    io.writeText(args.patchOutput, solvePatch(report));
    notes.push(`wrote ${args.patchOutput}`);
  }
  if (args.json) io.out(`${JSON.stringify(solveReportJson(report), null, 2)}\n`);
  else io.out(`${[formatSolveReport(report), ...notes].join("\n")}\n`);
  return solveExitCode(report, runChecks(proposal));
}
