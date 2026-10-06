import { runChecks } from "../core/checks";
import { describeScene } from "../core/describe";
import { buildDisplayList } from "../core/displayList";
import { IsoblockError, exitCodeFor } from "../core/errors";
import { checkExitCode, checkReportJson, formatCheckReport } from "../core/report";
import { parseScene } from "../core/validate";
import { USAGE, parseArgs, type Parsed } from "./args";
import { toSvg } from "./svg";

/** File and terminal access. The only thing the CLI needs from the outside world. */
export interface Io {
  readText(path: string): string;
  writeText(path: string, text: string): void;
  out(text: string): void;
  err(text: string): void;
}

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
    return execute(args, io);
  } catch (e) {
    if (e instanceof IsoblockError) return report(e, io);
    return report(new IsoblockError("E_INTERNAL", e instanceof Error ? e.message : String(e)), io);
  }
}
