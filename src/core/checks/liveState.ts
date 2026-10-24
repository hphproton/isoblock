import { changedObjects, involves, searchesGrid } from "../incremental";
import { hiddenObjects, sceneInState } from "../states";
import type { CheckResult, Scene } from "../types";
import { checkInState, runChecksInState } from "./inState";

const NO_STALE: ReadonlySet<string> = new Set();

function same(a: CheckResult, b: CheckResult): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function full(
  next: Scene,
  state: string,
  dragging: boolean,
  prevResults: readonly CheckResult[],
): { readonly results: readonly CheckResult[]; readonly stale: ReadonlySet<string> } {
  const fresh = runChecksInState(next, state);
  const specs = next.checks ?? [];
  const waiting = specs.filter((spec) => searchesGrid(spec));
  if (!dragging || waiting.length === 0) return { results: fresh, stale: NO_STALE };
  const stale = new Set(waiting.map((spec) => spec.id));
  if (prevResults.length !== specs.length) return { results: fresh, stale };
  const results = fresh.map((result, i) => (stale.has(result.id) ? (prevResults[i] as CheckResult) : result));
  return { results, stale };
}

/**
 * Check results of `next` in `state`, reusing `prevResults` from `prev`. During a drag, grid checks
 * keep their last result. `prev` null, a changed check list or a changed `states` object runs them all.
 */
export function resultsInState(
  prev: Scene | null,
  next: Scene,
  state: string,
  prevResults: readonly CheckResult[],
  dragging: boolean,
  stale: ReadonlySet<string>,
): { readonly results: readonly CheckResult[]; readonly stale: ReadonlySet<string> } {
  const specs = next.checks ?? [];
  const aligned = prev !== null && prevResults.length === specs.length && specs.every((spec, i) => prevResults[i]?.id === spec.id);
  const changed = prev === null ? "all" : changedObjects(prev, next);
  const statesChanged = prev !== null && prev.states !== next.states;
  if (!aligned || changed === "all" || statesChanged) return full(next, state, dragging, aligned ? prevResults : []);
  const hidden = hiddenObjects(next, state);
  const visible = sceneInState(next, state);
  const deferred: string[] = [];
  const results = specs.map((spec, i) => {
    const old = prevResults[i] as CheckResult;
    const waiting = stale.has(spec.id);
    if (!involves(spec, changed) && !waiting) return old;
    if (dragging && searchesGrid(spec)) {
      if (!waiting) deferred.push(spec.id);
      return old;
    }
    const fresh = checkInState(next, spec, hidden, state, visible);
    return same(fresh, old) ? old : fresh;
  });
  if (!dragging) return { results, stale: NO_STALE };
  return { results, stale: deferred.length === 0 ? stale : new Set([...stale, ...deferred]) };
}
