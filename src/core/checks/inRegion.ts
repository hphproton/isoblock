import { baseHeight, footprint, rectCorners, EPS } from "../geometry";
import { project } from "../projection";
import type { CheckResult, InRegionCheck, Region, Scene, SceneObject, Strip } from "../types";
import { partScreenBox } from "./screenBounds";
import { plural, round6, selectObjects } from "./result";

function cornersInside(scene: Scene, object: SceneObject, rect: readonly number[]): boolean {
  const [x0, y0, x1, y1] = rect as readonly [number, number, number, number];
  const h = baseHeight(object);
  return rectCorners(footprint(scene, object)).every((corner) => {
    const [x, y] = project(scene.camera, corner[0], corner[1], h);
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

function footprintOutside(scene: Scene, target: Target, object: SceneObject): boolean {
  const { region, strip } = target;
  return !region || !cornersInside(scene, object, region.rect) || (strip !== undefined && !insideStrip(scene, object, strip));
}

/** Share of the drawn box outside the region rect. A box with no area is 0 when it lies inside, else 1. */
function shareOutside(scene: Scene, object: SceneObject, rect: readonly number[]): number {
  const box = partScreenBox(scene, object);
  const [rx0, ry0, rx1, ry1] = rect as readonly [number, number, number, number];
  const area = (box.x1 - box.x0) * (box.y1 - box.y0);
  const inside = box.x0 >= rx0 - EPS && box.x1 <= rx1 + EPS && box.y0 >= ry0 - EPS && box.y1 <= ry1 + EPS;
  if (area <= EPS) return inside ? 0 : 1;
  const w = Math.min(box.x1, rx1) - Math.max(box.x0, rx0);
  const h = Math.min(box.y1, ry1) - Math.max(box.y0, ry0);
  const inter = w > 0 && h > 0 ? w * h : 0;
  return 1 - inter / area;
}

interface Judgement {
  readonly fail: boolean;
  readonly share: number;
}

function judge(scene: Scene, spec: InRegionCheck, target: Target, object: SceneObject): Judgement {
  if ((spec.measure ?? "footprint") !== "drawn" || target.region === undefined) {
    return { fail: footprintOutside(scene, target, object), share: 0 };
  }
  const share = shareOutside(scene, object, target.region.rect);
  const stripFail = target.strip !== undefined && !insideStrip(scene, object, target.strip);
  return { fail: share > (spec.maxOutside ?? 0) + EPS || stripFail, share };
}

function resultOf(
  spec: InRegionCheck,
  label: string,
  checked: number,
  failing: readonly string[],
  shares: ReadonlyMap<string, number> | null,
): CheckResult {
  const drawn = shares !== null;
  const where = drawn ? `${label} (drawn)` : label;
  const outside = shares === null ? undefined : failing.map((id) => round6(shares.get(id) ?? 0));
  return {
    id: spec.id,
    check: spec.check,
    status: failing.length === 0 ? "pass" : "fail",
    value: failing.length,
    threshold: 0,
    ids: failing,
    ...(outside === undefined ? {} : { outside }),
    message:
      failing.length === 0
        ? `${plural(checked, "object is", "objects are")} inside ${where}`
        : `${plural(failing.length, "object", "objects")} outside ${where}: ${failing.join(", ")}`,
  };
}

function collect(
  scene: Scene,
  spec: InRegionCheck,
  target: Target,
  checked: readonly SceneObject[],
  changed: ReadonlySet<string> | null,
  previous: CheckResult | null,
): CheckResult {
  const drawn = (spec.measure ?? "footprint") === "drawn";
  const kept = new Map<string, number>();
  if (changed !== null && previous !== null) {
    previous.ids.forEach((id, i) => {
      if (!changed.has(id)) kept.set(id, previous.outside?.[i] ?? Number.NaN);
    });
  }
  const failing: string[] = [];
  const shares = drawn ? new Map<string, number>() : null;
  for (const object of checked) {
    const reuse = changed !== null && !changed.has(object.id);
    if (reuse && !kept.has(object.id)) continue;
    const judged = reuse ? null : judge(scene, spec, target, object);
    const fail = judged === null ? true : judged.fail;
    if (!fail) continue;
    failing.push(object.id);
    if (shares !== null) {
      const share = judged === null ? kept.get(object.id) ?? Number.NaN : judged.share;
      shares.set(object.id, Number.isNaN(share) ? judge(scene, spec, target, object).share : share);
    }
  }
  return resultOf(spec, target.label, checked.length, failing, shares);
}

function hiddenRegion(scene: Scene, spec: InRegionCheck): CheckResult | null {
  if (!scene.hiddenRegions?.includes(spec.region)) return null;
  return { id: spec.id, check: spec.check, status: "skip", value: null, threshold: null, ids: [], message: `region "${spec.region}" is hidden in state "${scene.activeState ?? ""}"` };
}

/** Footprints, or drawn boxes, must lie inside the region (SPEC 9.1, 9.4). */
export function checkInRegion(scene: Scene, spec: InRegionCheck): CheckResult {
  return hiddenRegion(scene, spec) ?? collect(scene, spec, targetOf(scene, spec), selectObjects(scene, spec.ids), null, null);
}

/**
 * The result for `scene`, from the result for the scene before it, when only the objects in
 * `changed` differ: only those objects are measured again. Equal to `checkInRegion`.
 */
export function updateInRegion(scene: Scene, spec: InRegionCheck, prev: CheckResult, changed: ReadonlySet<string>): CheckResult {
  return hiddenRegion(scene, spec) ?? collect(scene, spec, targetOf(scene, spec), selectObjects(scene, spec.ids), changed, prev);
}
