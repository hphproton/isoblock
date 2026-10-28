import { fmt } from "../format";
import type { CheckResult, Scene } from "../types";
import { posForRotation } from "./place";
import type { SolveReport } from "./solve";

/** Exit code of `solve`: 0 when solved and every check of the proposal is `pass` or `warn`, else 1. */
export function solveExitCode(report: SolveReport, checks: readonly CheckResult[]): 0 | 1 {
  if (report.status !== "solved") return 1;
  return checks.some((c) => c.status === "fail" || c.status === "skip") ? 1 : 0;
}

/** The `--json` output of `solve`, keys in the order of SPEC section 8. */
export function solveReportJson(report: SolveReport): SolveReport {
  return {
    scene: report.scene,
    status: report.status,
    hardViolated: report.hardViolated,
    softPenalty: report.softPenalty,
    distance: report.distance,
    moved: report.moved,
    ...(report.turned === undefined ? {} : { turned: report.turned }),
    conflict: report.conflict,
    relations: report.relations,
  };
}

function list(ids: readonly string[]): string {
  return ids.length === 0 ? "none" : ids.join(", ");
}

/**
 * Text output of `solve`: `solve <scene id>: solved|conflict`, one line per moved object, the
 * hard relations still violated, the soft penalty and distance, and the conflict set. No trailing newline.
 */
export function formatSolveReport(report: SolveReport): string {
  const lines = [`solve ${report.scene}: ${report.status}`];
  for (const m of report.moved) lines.push(`move ${m.id} ${m.from.join(",")} -> ${m.to.join(",")}`);
  for (const turned of report.turned ?? []) lines.push(`rot ${turned.id} ${turned.from} -> ${turned.to}`);
  lines.push(`hard violated: ${list(report.hardViolated)}`);
  lines.push(`soft penalty ${fmt(report.softPenalty)}, distance ${fmt(report.distance)}`);
  if (report.status === "conflict") lines.push(`conflict: ${list(report.conflict)}`);
  return lines.join("\n");
}

/** A signed offset in plain decimal notation (no exponent), at most 12 decimals: `+0.35`, `-1`. */
export function offsetText(d: number): string {
  const digits = Math.abs(d).toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  return `${d < 0 ? "-" : "+"}${digits}`;
}

function moveLine(id: string, from: readonly number[], to: readonly number[]): string | null {
  const axes = [
    to[0] === from[0] ? "" : ` u${offsetText((to[0] as number) - (from[0] as number))}`,
    to[1] === from[1] ? "" : ` v${offsetText((to[1] as number) - (from[1] as number))}`,
  ];
  return axes.some((axis) => axis !== "") ? `move ${id}${axes.join("")}` : null;
}

/**
 * The proposal as a short-command patch (SPEC section 8): `# solve proposal`, then one `move`
 * per moved object in object order; an axis without an offset is left out. With `--rotate`, a
 * `rot` line comes before that object's `move`, and the offsets start from the position `rot` gives.
 */
export function solvePatch(scene: Scene, report: SolveReport): string {
  if (report.turned === undefined || report.turned.length === 0) {
    const moves = report.moved.flatMap((moved) => {
      const line = moveLine(moved.id, moved.from, moved.to);
      return line === null ? [`move ${moved.id}`] : [line];
    });
    return ["# solve proposal", ...moves].map((line) => `${line}\n`).join("");
  }
  const turned = new Map(report.turned.map((item) => [item.id, item]));
  const moved = new Map(report.moved.map((item) => [item.id, item]));
  const lines = ["# solve proposal"];
  for (const object of scene.objects) {
    const turn = turned.get(object.id);
    const shift = moved.get(object.id);
    if (turn !== undefined) lines.push(`rot ${object.id} ${turn.to}`);
    if (shift === undefined) continue;
    const from = turn === undefined ? shift.from : posForRotation(scene, object, turn.to);
    const line = moveLine(object.id, from, shift.to);
    if (line !== null) lines.push(line);
  }
  return lines.map((line) => `${line}\n`).join("");
}
