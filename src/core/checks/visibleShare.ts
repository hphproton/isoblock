import { EPS } from "../geometry";
import { objectCounts, type Rect } from "../raster/counts";
import { objectRaster, type ObjectRaster } from "../raster/raster";
import type { CheckResult, Scene, SceneObject, VisibleShareCheck } from "../types";
import { round6, skipResult } from "./result";

/** Objects the check examines, in file order. An `ids` list that names none examines none. */
function listed(scene: Scene, spec: VisibleShareCheck): readonly SceneObject[] {
  if (spec.ids !== undefined) {
    const want = new Set(spec.ids);
    return scene.objects.filter((object) => want.has(object.id));
  }
  const tag = spec.tag ?? "";
  return scene.objects.filter((object) => (object.tags ?? []).includes(tag));
}

function regionOf(scene: Scene, spec: VisibleShareCheck): Rect | null | "hidden" | "missing" {
  if (spec.region === undefined) return null;
  if ((scene.hiddenRegions ?? []).includes(spec.region)) return "hidden";
  const found = scene.frame.regions.find((region) => region.id === spec.region);
  return found === undefined ? "missing" : found.rect;
}

/**
 * Each examined object must show at least `min` of its own pixels in a frame region (SPEC 9.6).
 * `raster` is the one raster of this state; without it the check builds its own.
 */
export function checkVisibleShare(scene: Scene, spec: VisibleShareCheck, raster?: ObjectRaster): CheckResult {
  const region = regionOf(scene, spec);
  if (region === "hidden") {
    return skipResult(spec, `region "${spec.region}" is hidden in state "${scene.activeState ?? ""}"`);
  }
  if (region === "missing") return skipResult(spec, `unknown region "${spec.region}"`);
  const image = raster ?? objectRaster(scene);
  const slots = new Map(scene.objects.map((object, slot) => [object.id, slot]));
  const rows = listed(scene, spec).flatMap((object) => {
    const counts = objectCounts(image, slots.get(object.id) as number, region);
    return counts.full === 0 ? [] : [{ id: object.id, share: counts.visible / counts.full }];
  });
  if (rows.length === 0) return skipResult(spec, "no listed object is drawn in the region");
  const failing = rows.filter((row) => row.share < spec.min - EPS);
  const smallest = rows.reduce((min, row) => Math.min(min, row.share), Infinity);
  const status = failing.length === 0 ? "pass" : "fail";
  const shown = failing.map((row) => row.id).join(", ");
  return {
    id: spec.id,
    check: spec.check,
    status,
    value: round6(smallest),
    threshold: spec.min,
    ids: failing.map((row) => row.id),
    shares: failing.map((row) => round6(row.share)),
    message: status === "pass"
      ? `smallest share ${round6(smallest)} of ${rows.length} ${rows.length === 1 ? "object" : "objects"}`
      : `${shown}: shown below ${spec.min}`,
  };
}
