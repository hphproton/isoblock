import { EPS, indexObjects, sizeBox, worldParts, type Box } from "../geometry";
import { cameraDirection } from "../projection";
import { insideLength } from "../rays";
import type { CheckResult, Scene, Vec3, VisibleCheck } from "../types";
import { inObjectOrder, round6 } from "./result";

const GRID = 8;
const OFFSET = 1e-6;

const cells = (lo: number, hi: number): number[] =>
  Array.from({ length: GRID }, (_, i) => lo + ((i + 0.5) / GRID) * (hi - lo));

/** Sample points just outside the faces of `box` that face the camera. */
function samplePoints(box: Box, c: Vec3, from: number): Vec3[] {
  const hFrom = box.h0 + from * (box.h1 - box.h0);
  const points: Vec3[] = [];
  const sideH = cells(hFrom, box.h1);
  if (c[0] > EPS || c[0] < -EPS) {
    const u = c[0] > 0 ? box.u1 + OFFSET : box.u0 - OFFSET;
    for (const v of cells(box.v0, box.v1)) for (const h of sideH) points.push([u, v, h]);
  }
  if (c[1] > EPS || c[1] < -EPS) {
    const v = c[1] > 0 ? box.v1 + OFFSET : box.v0 - OFFSET;
    for (const u of cells(box.u0, box.u1)) for (const h of sideH) points.push([u, v, h]);
  }
  for (const u of cells(box.u0, box.u1)) for (const v of cells(box.v0, box.v1)) points.push([u, v, box.h1 + OFFSET]);
  return points;
}

/** The required part of the target may be occluded at most `maxOccluded`. */
export function checkVisible(scene: Scene, spec: VisibleCheck): CheckResult {
  const objects = indexObjects(scene);
  const target = objects.get(spec.target)!;
  const c = cameraDirection(scene.camera);
  const samples = samplePoints(sizeBox(scene, target), c, spec.from ?? 0.55);
  const others = scene.objects
    .filter((o) => o.id !== target.id)
    .map((o) => ({ id: o.id, boxes: worldParts(scene, o).map((p) => p.box) }));
  const occluders = new Set<string>();
  let occluded = 0;
  for (const point of samples) {
    const hitBy = others.filter((o) => o.boxes.some((box) => insideLength(point, c, box) > 0));
    if (hitBy.length > 0) occluded++;
    for (const o of hitBy) occluders.add(o.id);
  }
  const value = occluded / samples.length;
  const ok = value <= spec.maxOccluded + EPS;
  const names = inObjectOrder(scene, occluders);
  return {
    id: spec.id,
    check: spec.check,
    status: ok ? "pass" : "fail",
    value: round6(value),
    threshold: spec.maxOccluded,
    ids: [target.id],
    occluders: names,
    message: `${Math.round(value * 100)}% occluded (max ${Math.round(spec.maxOccluded * 100)}%)${names.length ? `: ${names.join(", ")}` : ""}`,
  };
}
