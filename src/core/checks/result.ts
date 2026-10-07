import type { CheckResult, CheckSpec, Scene, SceneObject } from "../types";

/** Same data with the stable key order of the JSON output. */
export function canonical(r: CheckResult): CheckResult {
  return {
    id: r.id,
    check: r.check,
    status: r.status,
    value: r.value,
    threshold: r.threshold,
    ids: r.ids,
    ...(r.pairs === undefined ? {} : { pairs: r.pairs }),
    ...(r.occluders === undefined ? {} : { occluders: r.occluders }),
    ...(r.accepted === undefined ? {} : { accepted: r.accepted }),
    ...(r.rejected === undefined ? {} : { rejected: r.rejected }),
    message: r.message,
  };
}

/** Round to 6 decimals: removes floating-point noise from reported numbers. */
export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function skipResult(spec: CheckSpec, message: string): CheckResult {
  return { id: spec.id, check: spec.check, status: "skip", value: null, threshold: null, ids: [], message };
}

/** Objects of the scene in file order, limited to `ids` when given. */
export function selectObjects(scene: Scene, ids: readonly string[] | undefined): readonly SceneObject[] {
  if (ids === undefined) return scene.objects;
  const wanted = new Set(ids);
  return scene.objects.filter((o) => wanted.has(o.id));
}

/** Ids in the order objects appear in the scene file. */
export function inObjectOrder(scene: Scene, ids: ReadonlySet<string>): string[] {
  return scene.objects.filter((o) => ids.has(o.id)).map((o) => o.id);
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
