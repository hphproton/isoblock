import { EPS, indexObjects, sizeBox, worldParts } from "../geometry";
import { cameraDirection } from "../projection";
import { insideLength } from "../rays";
import type { CheckResult, Scene, VisibleCheck } from "../types";
import { marginStatus } from "./margin";
import { inObjectOrder, round6 } from "./result";
import { visibleSamples } from "./visibleSamples";

/** The required part of the target may be occluded at most `maxOccluded`. */
export function checkVisible(scene: Scene, spec: VisibleCheck): CheckResult {
  const objects = indexObjects(scene);
  const target = objects.get(spec.target)!;
  const c = cameraDirection(scene.camera);
  const samples = visibleSamples(sizeBox(scene, target), c, spec.from ?? 0.55);
  const others = scene.objects
    .filter((o) => o.id !== target.id)
    .map((o) => ({ id: o.id, boxes: worldParts(scene, o).map((p) => p.box) }));
  const occluders = new Set<string>();
  let occluded = 0;
  for (const sample of samples) {
    const hitBy = others.filter((o) => o.boxes.some((box) => insideLength(sample.origin, c, box) > 0));
    if (hitBy.length > 0) occluded++;
    for (const o of hitBy) occluders.add(o.id);
  }
  const share = samples.length === 0 ? 0 : occluded / samples.length;
  const value = round6(share);
  const passing = share <= spec.maxOccluded + EPS;
  const status = marginStatus(passing, value, spec.maxOccluded, spec.warn, "upper");
  const names = inObjectOrder(scene, occluders);
  return {
    id: spec.id,
    check: spec.check,
    status,
    value,
    threshold: spec.maxOccluded,
    ids: [target.id],
    occluders: names,
    message: `${Math.round(share * 100)}% occluded (max ${Math.round(spec.maxOccluded * 100)}%)${names.length ? `: ${names.join(", ")}` : ""}`,
  };
}
