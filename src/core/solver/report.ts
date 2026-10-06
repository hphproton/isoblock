import { fmt } from "../format";
import type { CheckResult } from "../types";
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

/**
 * The proposal as a short-command patch (SPEC section 8): `# solve proposal`, then one `move`
 * per moved object in object order; an axis without an offset is left out.
 */
export function solvePatch(report: SolveReport): string {
  const moves = report.moved.map((m) => {
    const axes = [
      m.to[0] === m.from[0] ? "" : ` u${offsetText(m.to[0] - m.from[0])}`,
      m.to[1] === m.from[1] ? "" : ` v${offsetText(m.to[1] - m.from[1])}`,
    ];
    return `move ${m.id}${axes.join("")}`;
  });
  return ["# solve proposal", ...moves].map((line) => `${line}\n`).join("");
}
