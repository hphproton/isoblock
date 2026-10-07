import { EPS, worldParts } from "../geometry";
import { projector } from "../projection";
import { round } from "../round";
import type { Scene, SceneObject } from "../types";

export type BboxUnits = "px" | "norm1000";
export type BboxOrder = "xyxy" | "yxyx";

export interface BboxOptions {
  readonly units: BboxUnits;
  readonly order: BboxOrder;
}

export interface GenBboxEntry {
  readonly id: string;
  readonly type: string;
  readonly box: readonly number[];
  readonly clipped: boolean;
  readonly hint?: string;
}

/** The file `isoblock-genbbox/1` (SPEC 14). */
export interface GenBboxFile {
  readonly schema: "isoblock-genbbox/1";
  readonly scene: string;
  readonly frame: { readonly w: number; readonly h: number };
  readonly units: BboxUnits;
  readonly order: BboxOrder;
  readonly boxes: readonly GenBboxEntry[];
}

type Bounds = readonly [number, number, number, number];

/** Screen bounds of every corner of every part of an object. */
function screenBounds(scene: Scene, object: SceneObject): Bounds {
  const at = projector(scene.camera);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { box } of worldParts(scene, object)) {
    for (const u of [box.u0, box.u1]) {
      for (const v of [box.v0, box.v1]) {
        for (const h of [box.h0, box.h1]) {
          const [x, y] = at(u, v, h);
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
    }
  }
  return [x0, y0, x1, y1];
}

/** Normalised to 0..1000 of the frame, to whole numbers, halves up. */
function norm(value: number, size: number): number {
  return Math.floor((value * 1000) / size + 0.5 + EPS);
}

function convert(box: Bounds, scene: Scene, options: BboxOptions): readonly number[] {
  const [x0, y0, x1, y1] = options.units === "px"
    ? box.map((x) => round(x, 2))
    : [norm(box[0], scene.frame.w), norm(box[1], scene.frame.h), norm(box[2], scene.frame.w), norm(box[3], scene.frame.h)];
  return options.order === "xyxy" ? [x0 as number, y0 as number, x1 as number, y1 as number] : [y0 as number, x0 as number, y1 as number, x1 as number];
}

/** One screen box per object for image-generation tools (SPEC 14). */
export function genBboxFile(scene: Scene, options: BboxOptions): GenBboxFile {
  const { w, h } = scene.frame;
  const boxes: GenBboxEntry[] = [];
  for (const object of scene.objects) {
    const raw = screenBounds(scene, object);
    const cut: Bounds = [Math.max(raw[0], 0), Math.max(raw[1], 0), Math.min(raw[2], w), Math.min(raw[3], h)];
    if (cut[2] - cut[0] <= EPS || cut[3] - cut[1] <= EPS) continue;
    const hint = scene.types[object.type]?.genHint;
    boxes.push({
      id: object.id,
      type: object.type,
      box: convert(cut, scene, options),
      clipped: cut.some((x, k) => Math.abs(x - (raw[k] as number)) > EPS),
      ...(hint === undefined ? {} : { hint }),
    });
  }
  return { schema: "isoblock-genbbox/1", scene: scene.id, frame: { w, h }, units: options.units, order: options.order, boxes };
}
