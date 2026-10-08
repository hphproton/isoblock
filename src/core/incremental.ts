import { runCheck, runChecks, updateCheck } from "./checks";
import type { CheckResult, CheckSpec, ImplementedCheck, Scene, SceneObject } from "./types";

/** Ids of the objects that differ between two scenes, or `"all"` when shared inputs changed. */
export type Changed = ReadonlySet<string> | "all";

/**
 * Compare two scenes by reference, the way immutable edits keep unchanged data shared. Objects
 * count as changed when their data changed or when the definition of their type changed.
 * The camera, frame, strips, zones, lanes and check list reach every check, so a change there is `"all"`.
 */
export function changedObjects(prev: Scene, next: Scene): Changed {
  if (prev === next) return new Set();
  if (
    prev.camera !== next.camera ||
    prev.frame !== next.frame ||
    prev.strips !== next.strips ||
    prev.zones !== next.zones ||
    prev.lanes !== next.lanes ||
    prev.checks !== next.checks
  ) {
    return "all";
  }
  const changed = aligned(prev, next) ?? shuffled(prev, next);
  if (prev.types !== next.types) {
    const names = new Set([...Object.keys(prev.types), ...Object.keys(next.types)]);
    const edited = new Set([...names].filter((name) => prev.types[name] !== next.types[name]));
    if (edited.size > 0) {
      for (const o of [...prev.objects, ...next.objects]) if (edited.has(o.type)) changed.add(o.id);
    }
  }
  return changed;
}

/** Ids that differ when both scenes list the same ids in the same order, which is what edits give; else null. */
function aligned(prev: Scene, next: Scene): Set<string> | null {
  if (prev.objects.length !== next.objects.length) return null;
  const changed = new Set<string>();
  for (let i = 0; i < next.objects.length; i++) {
    const a = prev.objects[i] as SceneObject;
    const b = next.objects[i] as SceneObject;
    if (a === b) continue;
    if (a.id !== b.id) return null;
    changed.add(b.id);
  }
  return changed;
}

/** Ids that differ when objects were added, removed or reordered. */
function shuffled(prev: Scene, next: Scene): Set<string> {
  const changed = new Set<string>();
  const before = new Map(prev.objects.map((o) => [o.id, o]));
  const after = new Map(next.objects.map((o) => [o.id, o]));
  for (const [id, o] of after) if (before.get(id) !== o) changed.add(id);
  for (const id of before.keys()) if (!after.has(id)) changed.add(id);
  return changed;
}

function touches(changed: ReadonlySet<string>, ids: readonly string[] | undefined): boolean {
  return ids === undefined ? changed.size > 0 : ids.some((id) => changed.has(id));
}

/** True when a change to the given objects can change the result of the check. */
export function involves(spec: CheckSpec, changed: ReadonlySet<string>): boolean {
  const check = spec as ImplementedCheck;
  switch (check.check) {
    case "in_region":
    case "no_overlap":
      return touches(changed, check.ids);
    case "clearance":
      return changed.has(check.a) || changed.has(check.b);
    case "lane_clear": {
      const ignored = new Set(check.ignore ?? []);
      return [...changed].some((id) => !ignored.has(id));
    }
    case "visible":
    case "reachable":
    case "capacity":
    case "sort_consistency":
      return changed.size > 0;
    case "min_screen_size":
      return changed.has(check.target);
    default:
      return false;
  }
}

/**
 * Checks that search a grid (`reachable`, `sort_consistency`). They are too slow to re-run on every
 * pointer move of a drag, so the editor re-runs them when the drag ends (SPEC 10).
 */
export function searchesGrid(spec: CheckSpec): boolean {
  return spec.check === "reachable" || spec.check === "sort_consistency";
}

export interface ResultUpdate {
  readonly results: readonly CheckResult[];
  /** Ids of the checks that ran again. */
  readonly rerun: readonly string[];
  /** Ids of the checks that involve a change but kept their previous result, because `defer` said so. */
  readonly deferred: readonly string[];
}

function same(a: CheckResult, b: CheckResult): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Results for `next`, given the results for `prev`. Only checks that involve a changed object run
 * again (SPEC section 9). A check for which `defer` is true keeps its previous result and is listed
 * in `deferred` instead; when the check list or a shared input changed, every check runs. A result
 * that did not change is the same object as before.
 */
export function updateResults(
  prev: Scene,
  next: Scene,
  prevResults: readonly CheckResult[],
  defer: (spec: CheckSpec) => boolean = () => false,
): ResultUpdate {
  const specs = next.checks ?? [];
  const changed = changedObjects(prev, next);
  const aligned = prevResults.length === specs.length && specs.every((s, i) => prevResults[i]?.id === s.id);
  if (changed === "all" || !aligned) return { results: runChecks(next), rerun: specs.map((s) => s.id), deferred: [] };
  const rerun: string[] = [];
  const deferred: string[] = [];
  const results = specs.map((spec, i) => {
    const old = prevResults[i] as CheckResult;
    if (!involves(spec, changed)) return old;
    if (defer(spec)) {
      deferred.push(spec.id);
      return old;
    }
    rerun.push(spec.id);
    const fresh = updateCheck(next, spec, old, changed);
    return same(fresh, old) ? old : fresh;
  });
  return { results, rerun, deferred };
}

/**
 * `results` (one per check of `scene`, in order) with the checks named in `ids` run again in full.
 * A result that did not change is the same object as before.
 */
export function rerunResults(scene: Scene, results: readonly CheckResult[], ids: ReadonlySet<string>): readonly CheckResult[] {
  if (ids.size === 0) return results;
  const specs = scene.checks ?? [];
  return results.map((old, i) => {
    const spec = specs[i];
    if (spec === undefined || !ids.has(spec.id)) return old;
    const fresh = runCheck(scene, spec);
    return same(fresh, old) ? old : fresh;
  });
}
