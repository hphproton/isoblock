import { countDifferences, frameIds, paintedIds } from "./measure";
import { objectPolygons } from "./svgObjects";

/** The id and type of the actor in the reference scene (SPEC 13.6). */
export const ACTOR_ID = "isoblock-actor";

/**
 * The scene with the actor added as its last object (SPEC 13.6): type and id `isoblock-actor`, size
 * `[w, d, h]`, footprint centered on `at`. The position is rounded to 9 decimals, so that the file
 * does not carry floating-point noise such as 2.1500000000000004.
 */
export function sceneWithActor(sceneText: string, size: readonly [number, number, number], at: readonly [number, number]): string {
  const scene = JSON.parse(sceneText) as { types: Record<string, unknown>; objects: unknown[] };
  if (ACTOR_ID in scene.types) throw new Error(`the scene already has a type ${ACTOR_ID}`);
  const pos = [at[0] - size[0] / 2, at[1] - size[1] / 2].map((x) => Number(x.toFixed(9)) + 0);
  scene.types = { ...scene.types, [ACTOR_ID]: { size: [...size] } };
  scene.objects = [...scene.objects, { id: ACTOR_ID, type: ACTOR_ID, pos }];
  return `${JSON.stringify(scene, null, 2)}\n`;
}

export interface ActorFrame {
  /** The SVG of `render` for the scene with the actor (`sceneWithActor`). */
  readonly svg: string;
  /** The engine frame with the actor, 4 bytes per pixel. */
  readonly rgba: Uint8Array;
}

/**
 * Pixels that differ in which object they show between an engine frame with the actor and the
 * painter's raster of its reference SVG. `ids` are the scene's objects in file order; the actor is
 * number `ids.length + 1`, after them.
 */
export function actorDifferences(frame: ActorFrame, ids: readonly string[], width: number, height: number): number {
  const all = [...ids, ACTOR_ID];
  return countDifferences(frameIds(frame.rgba), paintedIds(objectPolygons(frame.svg), all, width, height));
}
