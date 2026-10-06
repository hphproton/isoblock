import { frameExtent, type GroundExtent } from "./displayGround";
import { worldParts } from "./geometry";
import type { Camera, Scene } from "./types";

/** Top-down camera for the plan view: u to the right, v downwards, no height. */
export function planCamera(pxPerUnit = 40): Camera {
  return { angleU: 0, angleV: 90, pxPerUnit, verticalScale: 0, origin: [0, 0] };
}

/**
 * Ground rectangle `[u0, v0, u1, v1]` that holds the scene content: objects (parts included),
 * lane and zone points and the finite edges of strips. Without content, the ground the frame shows.
 */
export function contentGround(scene: Scene): GroundExtent {
  const us: number[] = [];
  const vs: number[] = [];
  for (const o of scene.objects) {
    for (const { box } of worldParts(scene, o)) {
      us.push(box.u0, box.u1);
      vs.push(box.v0, box.v1);
    }
  }
  for (const lane of scene.lanes ?? []) {
    const half = lane.width / 2;
    for (const [u, v] of lane.points) {
      us.push(u - half, u + half);
      vs.push(v - half, v + half);
    }
  }
  for (const zone of scene.zones ?? []) {
    for (const [u, v] of zone.points ?? []) {
      us.push(u);
      vs.push(v);
    }
  }
  for (const strip of scene.strips ?? []) {
    for (const v of strip.v) if (v !== null) vs.push(v);
  }
  if (us.length === 0 || vs.length === 0) return frameExtent(scene);
  return [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)];
}
