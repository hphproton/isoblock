import { footprint, rectCorners, EPS } from "../geometry";
import { project } from "../projection";
import type { CheckResult, InRegionCheck, Region, Scene, SceneObject, Strip } from "../types";
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

interface Target {
  readonly region: Region | undefined;
  readonly strip: Strip | undefined;
  readonly label: string;
}

function targetOf(scene: Scene, spec: InRegionCheck): Target {
  return {
    region: scene.frame.regions.find((r) => r.id === spec.region),
    strip: spec.strip === undefined ? undefined : (scene.strips ?? []).find((s) => s.id === spec.strip),
    label: spec.strip === undefined ? spec.region : `${spec.region}/${spec.strip}`,
  };
}

function isOutside(scene: Scene, target: Target, object: SceneObject): boolean {
  const { region, strip } = target;
  return !region || !cornersInside(scene, object, region.rect) || (strip !== undefined && !insideStrip(scene, object, strip));
}

function resultOf(spec: InRegionCheck, label: string, checked: number, failing: readonly string[]): CheckResult {
  return {
    id: spec.id,
    check: spec.check,
    status: failing.length === 0 ? "pass" : "fail",
    value: failing.length,
    threshold: 0,
    ids: failing,
    message:
      failing.length === 0
        ? `${plural(checked, "object is", "objects are")} inside ${label}`
        : `${plural(failing.length, "object", "objects")} outside ${label}: ${failing.join(", ")}`,
  };
}

/** Footprint corners must lie inside the region rect and, optionally, the strip's v range. */
export function checkInRegion(scene: Scene, spec: InRegionCheck): CheckResult {
  const target = targetOf(scene, spec);
  const checked = selectObjects(scene, spec.ids);
  const failing = checked.filter((o) => isOutside(scene, target, o)).map((o) => o.id);
  return resultOf(spec, target.label, checked.length, failing);
}

/**
 * The result for `scene`, from the result for the scene before it, when only the objects in
 * `changed` differ: only those objects are measured again. Equal to `checkInRegion`.
 */
export function updateInRegion(scene: Scene, spec: InRegionCheck, prev: CheckResult, changed: ReadonlySet<string>): CheckResult {
  const target = targetOf(scene, spec);
  const checked = selectObjects(scene, spec.ids);
  const failing = new Set(prev.ids.filter((id) => !changed.has(id)));
  for (const o of checked) if (changed.has(o.id) && isOutside(scene, target, o)) failing.add(o.id);
  return resultOf(spec, target.label, checked.length, checked.filter((o) => failing.has(o.id)).map((o) => o.id));
}
