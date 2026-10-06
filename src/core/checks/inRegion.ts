import { footprint, rectCorners, EPS } from "../geometry";
import { project } from "../projection";
import type { CheckResult, InRegionCheck, Scene, SceneObject, Strip } from "../types";
import { plural, selectObjects } from "./result";

function cornersInside(scene: Scene, object: SceneObject, rect: readonly number[]): boolean {
  const [x0, y0, x1, y1] = rect as readonly [number, number, number, number];
  return rectCorners(footprint(scene, object)).every((corner) => {
    const [x, y] = project(scene.camera, corner[0], corner[1], 0);
    return x >= x0 - EPS && x <= x1 + EPS && y >= y0 - EPS && y <= y1 + EPS;
  });
}

function insideStrip(scene: Scene, object: SceneObject, strip: Strip): boolean {
  const { v0, v1 } = footprint(scene, object);
  const [min, max] = strip.v;
  return (min === null || v0 >= min - EPS) && (max === null || v1 <= max + EPS);
}

/** Footprint corners must lie inside the region rect and, optionally, the strip's v range. */
export function checkInRegion(scene: Scene, spec: InRegionCheck): CheckResult {
  const region = scene.frame.regions.find((r) => r.id === spec.region);
  const strip = spec.strip === undefined ? undefined : (scene.strips ?? []).find((s) => s.id === spec.strip);
  const label = spec.strip === undefined ? spec.region : `${spec.region}/${spec.strip}`;
  const checked = selectObjects(scene, spec.ids);
  const failing = checked
    .filter((o) => !region || !cornersInside(scene, o, region.rect) || (strip !== undefined && !insideStrip(scene, o, strip)))
    .map((o) => o.id);
  return {
    id: spec.id,
    check: spec.check,
    status: failing.length === 0 ? "pass" : "fail",
    value: failing.length,
    threshold: 0,
    ids: failing,
    message:
      failing.length === 0
        ? `${plural(checked.length, "object is", "objects are")} inside ${label}`
        : `${plural(failing.length, "object", "objects")} outside ${label}: ${failing.join(", ")}`,
  };
}
