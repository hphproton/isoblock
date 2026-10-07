import { resolve } from "node:path";
import { genBboxFile } from "../core/export/genBbox";
import { runtimeFile } from "../core/export/runtime";
import { IsoblockError } from "../core/errors";
import { serializeJson } from "../core/serialize";
import { sceneInState } from "../core/states";
import { parseScene } from "../core/validate";
import type { Parsed } from "./args";
import type { Io } from "./io";

type ExportArgs = Extract<Parsed, { kind: "export" }>;

/**
 * `export`: write a derived file for engines (`runtime`) or image-generation tools (`gen-bbox`) to
 * `-o`, else to stdout. The scene file is the source of truth and is never written.
 */
export function runExportCommand(args: ExportArgs, io: Io): number {
  if (args.output !== undefined && resolve(args.output) === resolve(args.file)) {
    throw new IsoblockError("E_USAGE", "export never writes its input file: choose another output name", ["Try 'isoblock --help'."]);
  }
  const scene = parseScene(io.readText(args.file));
  const file = args.target === "runtime"
    ? runtimeFile(scene)
    : genBboxFile(sceneInState(scene, args.state), { units: args.bboxUnits ?? "px", order: args.bboxOrder ?? "xyxy" });
  const text = serializeJson(file);
  if (args.output === undefined) {
    io.out(text);
  } else {
    io.writeText(args.output, text);
    io.out(`wrote ${args.output}\n`);
  }
  return 0;
}
