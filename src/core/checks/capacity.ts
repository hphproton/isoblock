import { footprint, rectsOverlap, worldPoint, type Rect } from "../geometry";
import type { CapacityCheck, CheckResult, Scene } from "../types";
import { inObjectOrder } from "./result";

const DEFAULT_BODY = [0.5, 0.5] as const;

interface Candidate {
  readonly label: string;
  readonly object: string;
  readonly body: Rect;
}

/** Anchors of the wanted kind, objects in file order and anchors in type order, with their body rectangles. */
function candidates(scene: Scene, spec: CapacityCheck): readonly Candidate[] {
  const [w, d] = spec.body ?? DEFAULT_BODY;
  const wanted = spec.ids === undefined ? undefined : new Set(spec.ids);
  const out: Candidate[] = [];
  for (const object of scene.objects) {
    if (wanted !== undefined && !wanted.has(object.id)) continue;
    for (const anchor of scene.types[object.type]?.anchors ?? []) {
      if (anchor.kind !== spec.kind) continue;
      const [u, v] = worldPoint(scene, object, anchor.at[0], anchor.at[1]);
      out.push({
        label: `${object.id}/${anchor.id}`,
        object: object.id,
        body: { u0: u - w / 2, v0: v - d / 2, u1: u + w / 2, v1: v + d / 2 },
      });
    }
  }
  return out;
}

/**
 * At least `min` anchors of `kind` can be used at once (SPEC section 9.2). In order, a candidate is
 * accepted when its body overlaps neither the footprint of another object (except those in
 * `allow`) nor the body of a candidate accepted before.
 */
export function checkCapacity(scene: Scene, spec: CapacityCheck): CheckResult {
  const list = candidates(scene, spec);
  const footprints = scene.objects.map((o) => ({ id: o.id, rect: footprint(scene, o) }));
  const allowed = new Set(spec.allow ?? []);
  const accepted: Candidate[] = [];
  const rejected: string[] = [];
  for (const c of list) {
    const blocked =
      footprints.some((f) => f.id !== c.object && !allowed.has(f.id) && rectsOverlap(c.body, f.rect)) ||
      accepted.some((a) => rectsOverlap(c.body, a.body));
    if (blocked) rejected.push(c.label);
    else accepted.push(c);
  }
  return {
    id: spec.id,
    check: spec.check,
    status: accepted.length >= spec.min ? "pass" : "fail",
    value: accepted.length,
    threshold: spec.min,
    ids: inObjectOrder(scene, new Set(list.map((c) => c.object))),
    accepted: accepted.map((c) => c.label),
    rejected,
    message: `${accepted.length} of ${list.length} "${spec.kind}" anchors usable (min ${spec.min})${rejected.length > 0 ? `; blocked: ${rejected.join(", ")}` : ""}`,
  };
}
