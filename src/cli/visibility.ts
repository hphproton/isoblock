import { DEFAULT_STEP, formatOccluders, occludersReport } from "../core/occluders";
import { formatVisibility, visibilityReport } from "../core/raster/visibility";
import { parseScene } from "../core/validate";
import type { Parsed } from "./args";
import type { Io } from "./io";

function printJson(io: Io, value: unknown): void {
  io.out(`${JSON.stringify(value, null, 2)}\n`);
}

/** `visibility`: shares and coverage of the drawn objects in a region (SPEC 11.3). */
export function runVisibilityCommand(args: Extract<Parsed, { kind: "visibility" }>, io: Io): number {
  const scene = parseScene(io.readText(args.file));
  const report = visibilityReport(scene, args.state ?? null, args.region ?? null);
  if (args.json) printJson(io, report);
  else io.out(`${formatVisibility(report)}\n`);
  return 0;
}

/** `occluders`: objects that hide an actor in a lane or a zone (SPEC 11.4). */
export function runOccludersCommand(args: Extract<Parsed, { kind: "occluders" }>, io: Io): number {
  const scene = parseScene(io.readText(args.file));
  const report = occludersReport(scene, args.state ?? null, args.actor, args.step ?? DEFAULT_STEP, args.lane, args.zone);
  if (args.json) printJson(io, report);
  else io.out(`${formatOccluders(report)}\n`);
  return 0;
}
