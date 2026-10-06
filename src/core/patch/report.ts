import { diffLine } from "../diff";
import { exitCodeFor } from "../errors";
import { plain } from "../format";
import type { PatchOutcome } from "./outcome";

/** Exit code of `patch` (SPEC section 11): 3 for a touched lock, 2 for an invalid patch, else 1 when a check fails or is skipped. */
export function patchExitCode(o: PatchOutcome): number {
  if (o.error !== null) return exitCodeFor(o.error.code);
  return (o.failing ?? 0) > 0 ? 1 : 0;
}

/** The `--json` output of `patch` (SPEC section 12). */
export function patchReportJson(o: PatchOutcome) {
  return {
    scene: o.scene.id,
    status: o.status,
    error: o.error,
    locks: o.locks,
    diff: o.diff,
    checks: o.checks,
    failing: o.failing,
  };
}

function shown(value: number | null): string {
  return value === null ? "none" : plain(value);
}

/**
 * Text output of `patch`: `patch <scene id>: applied|rejected|invalid`, the error, one line per
 * diff entry and one per changed check, then the number of failing checks. No trailing newline.
 */
export function formatPatchReport(o: PatchOutcome): string {
  const lines = [`patch ${o.scene.id}: ${o.status}`];
  if (o.error !== null) lines.push(`error ${o.error.code}: ${o.error.message}`);
  lines.push(...o.diff.map(diffLine));
  for (const c of o.checks) {
    lines.push(`check ${c.id} ${c.check}: ${c.from} -> ${c.to} (${shown(c.value[0])} -> ${shown(c.value[1])})`);
  }
  if (o.failing !== null) lines.push(`failing checks: ${o.failing}`);
  return lines.join("\n");
}

/** One line of the patch log, without the newline (SPEC section 12). */
export function patchLogLine(seq: number, patchName: string, o: PatchOutcome): string {
  return JSON.stringify({
    seq,
    patch: patchName,
    description: o.description,
    status: o.status,
    error: o.error,
    locks: o.locks,
    diff: o.diff,
    checks: o.checks,
  });
}
