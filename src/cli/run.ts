import { runChecks } from "../core/checks";
import { describeScene } from "../core/describe";
import { buildDisplayList } from "../core/displayList";
import { IsoblockError, exitCodeFor } from "../core/errors";
import { evaluateRelations } from "../core/relations/evaluate";
import { formatRelationsReport, relationsExitCode, relationsReportJson } from "../core/relations/report";
import { checkExitCode, checkReportJson, formatCheckReport } from "../core/report";
import { parseScene } from "../core/validate";
import { USAGE, parseArgs, type Parsed } from "./args";
import { runCompareCommand, runDiffCommand, runPatchCommand } from "./commands";
import { runSolveCommand } from "./solve";
import type { Io } from "./io";
import { toSvg } from "./svg";

export type { Io } from "./io";

type RunArgs = Extract<Parsed, { kind: "run" }>;

function execute(args: RunArgs, io: Io): number {
  const scene = parseScene(io.readText(args.file));
  switch (args.command) {
    case "validate":
      io.out(`ok: ${args.file} is a valid isoblock/1 scene (id ${scene.id})\n`);
      return 0;
    case "check": {
      const results = runChecks(scene);
      io.out(args.json ? `${JSON.stringify(checkReportJson(scene, results), null, 2)}\n` : `${formatCheckReport(scene, results)}\n`);
      return checkExitCode(results);
    }
    case "describe":
      io.out(`${describeScene(scene, runChecks(scene))}\n`);
      return 0;
    case "relations": {
      const report = evaluateRelations(scene);
      io.out(args.json ? `${JSON.stringify(relationsReportJson(scene, report), null, 2)}\n` : `${formatRelationsReport(scene, report)}\n`);
      return relationsExitCode(report.results);
    }
    case "render": {
      const output = args.output as string;
      io.writeText(output, toSvg(buildDisplayList(scene)));
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
    switch (args.kind) {
      case "patch":
        return runPatchCommand(args, io);
      case "diff":
        return runDiffCommand(args, io);
      case "compare":
        return runCompareCommand(args, io);
      case "solve":
        return runSolveCommand(args, io);
      default:
        return execute(args, io);
    }
  } catch (e) {
    if (e instanceof IsoblockError) return report(e, io);
    return report(new IsoblockError("E_INTERNAL", e instanceof Error ? e.message : String(e)), io);
  }
}
