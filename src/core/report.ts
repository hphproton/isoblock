import type { CheckResult, Scene } from "./types";

/** Exit code of `check`: 1 if any check failed or could not be evaluated, else 0. */
export function checkExitCode(results: readonly CheckResult[]): 0 | 1 {
  return results.some((r) => r.status === "fail" || r.status === "skip") ? 1 : 0;
}

/** Summary line, then one `PASS|FAIL|WARN|SKIP <id> <check>: <message>` line per check. The summary names the state, if any. */
export function formatCheckReport(scene: Scene, results: readonly CheckResult[], state?: string): string {
  const name = state === undefined ? scene.id : `${scene.id} (state ${state})`;
  if (results.length === 0) return `scene ${name}: 0 checks`;
  const count = (status: CheckResult["status"]) => results.filter((r) => r.status === status).length;
  const summary =
    `scene ${name}: ${results.length} checks, ${count("pass")} pass, ${count("fail")} fail, ` +
    `${count("warn")} warn, ${count("skip")} skip`;
  const lines = results.map((r) => `${r.status.toUpperCase()} ${r.id} ${r.check}: ${r.message}`);
  return [summary, ...lines].join("\n");
}

/** The `--json` output of `check`. */
export function checkReportJson(
  scene: Scene,
  results: readonly CheckResult[],
): { readonly scene: string; readonly results: readonly CheckResult[] } {
  return { scene: scene.id, results };
}
