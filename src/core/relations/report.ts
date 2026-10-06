import { fmt } from "../format";
import type { Scene } from "../types";
import type { RelationReport, RelationResult } from "./evaluate";

const LABEL: Readonly<Record<RelationResult["status"], string>> = { satisfied: "OK", violated: "BAD", skip: "SKIP" };

/** Exit code of `relations`: 0 when every hard relation is satisfied, else 1 (a skipped hard relation is not satisfied). */
export function relationsExitCode(results: readonly RelationResult[]): 0 | 1 {
  return results.some((r) => r.hard && r.status !== "satisfied") ? 1 : 0;
}

/** The `--json` output of `relations`. */
export function relationsReportJson(
  scene: Scene,
  report: RelationReport,
): { readonly scene: string; readonly results: readonly RelationResult[] } {
  return { scene: scene.id, results: report.results };
}

/** Summary line, then one `OK|BAD|SKIP <id> <rel>: <message>` line per relation. No trailing newline. */
export function formatRelationsReport(scene: Scene, report: RelationReport): string {
  const { results } = report;
  if (results.length === 0) return `relations ${scene.id}: 0 relations`;
  const count = (status: RelationResult["status"]) => results.filter((r) => r.status === status).length;
  const hard = results.filter((r) => r.hard);
  const summary =
    `relations ${scene.id}: ${results.length} relations, ${count("satisfied")} satisfied, ${count("violated")} violated, ` +
    `${count("skip")} skipped; hard: ${hard.filter((r) => r.status === "satisfied").length} of ${hard.length} satisfied; ` +
    `soft penalty ${fmt(report.softPenalty)}`;
  return [summary, ...results.map((r) => `${LABEL[r.status]} ${r.id} ${r.rel}: ${r.message}`)].join("\n");
}
