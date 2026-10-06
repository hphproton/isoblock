import { anchorItems, objectItems, type ObjectCache } from "./displayObjects";
import { frameExtent, groundItems, type GroundExtent, type GroundItems } from "./displayGround";
import type { DisplayList } from "./displayTypes";
import type { Camera, Scene } from "./types";

export type {
  DisplayItem,
  DisplayLabel,
  DisplayList,
  DisplayPolygon,
  LabelTarget,
  Layer,
} from "./displayTypes";
export type { GroundExtent } from "./displayGround";

/**
 * Work kept between calls so that an editor redraws only what changed. The caller owns it and
 * passes it back in; the core keeps no state of its own.
 */
export interface DisplayCache extends ObjectCache {
  ground: { readonly key: readonly unknown[]; readonly value: GroundItems } | null;
}

export function createDisplayCache(): DisplayCache {
  return { camera: null, entries: new WeakMap(), ground: null };
}

export interface DisplayOptions {
  /** Camera that draws the view. Default: the scene camera. A top-down camera gives a plan view. */
  readonly camera?: Camera;
  /** Ground rectangle that strips are drawn over. Default: the part of the ground the frame shows. */
  readonly groundExtent?: GroundExtent;
  /** Draw a marker and a label for every anchor. Default: false. */
  readonly anchors?: boolean;
  readonly cache?: DisplayCache;
}

function sameKey(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function ground(scene: Scene, camera: Camera, extent: GroundExtent, cache: DisplayCache): GroundItems {
  const key = [scene.id, camera, scene.camera, scene.frame, scene.strips, scene.zones, scene.lanes, ...extent];
  if (cache.ground !== null && sameKey(cache.ground.key, key)) return cache.ground.value;
  const value = groundItems(scene, camera, extent);
  cache.ground = { key, value };
  return value;
}

/** Build the display list for a scene: ground, objects back to front, region outlines, labels. */
export function buildDisplayList(scene: Scene, options: DisplayOptions = {}): DisplayList {
  const camera = options.camera ?? scene.camera;
  const cache = options.cache ?? createDisplayCache();
  const base = ground(scene, camera, options.groundExtent ?? frameExtent(scene), cache);
  const objects = objectItems(scene, camera, cache);
  const anchors = options.anchors === true ? anchorItems(scene, camera) : { marks: [], labels: [] };
  return {
    width: scene.frame.w,
    height: scene.frame.h,
    items: [
      ...base.under,
      ...objects.boxes,
      ...anchors.marks,
      ...base.outlines,
      ...base.labels,
      ...anchors.labels,
      ...objects.labels,
    ],
  };
}
