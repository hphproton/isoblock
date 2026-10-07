import { worldPoint } from "../geometry";
import type { Anchor, PointRef, Scene, SceneObject, Vec2 } from "../types";

const LANE = "lane:";
const ANCHOR = "anchor:";

/** An anchor named by `anchor:<object id>/<anchor id>`. */
export interface AnchorRef {
  readonly object: SceneObject;
  readonly anchor: Anchor;
}

/**
 * The object and the anchor a text names, or `null`. Ids may contain `/`: the first split at which
 * both the object and its type's anchor exist wins.
 */
export function parseAnchorRef(scene: Scene, text: string): AnchorRef | null {
  if (!text.startsWith(ANCHOR)) return null;
  const body = text.slice(ANCHOR.length);
  for (let at = body.indexOf("/"); at >= 0; at = body.indexOf("/", at + 1)) {
    const object = scene.objects.find((o) => o.id === body.slice(0, at));
    const anchor = object === undefined ? undefined : scene.types[object.type]?.anchors?.find((a) => a.id === body.slice(at + 1));
    if (object !== undefined && anchor !== undefined) return { object, anchor };
  }
  return null;
}

/** The id of the lane a text names (`lane:<id>`), or `null` when it is not a lane reference. */
export function laneRefId(ref: PointRef): string | null {
  return typeof ref === "string" && ref.startsWith(LANE) ? ref.slice(LANE.length) : null;
}

/** What a point reference means: a ground point, and the object whose anchor it names (else `null`). */
export interface ResolvedPoint {
  readonly at: Vec2;
  readonly object: string | null;
}

/**
 * A ground point (SPEC section 9.2): `[u, v]`; `lane:<id>`, the lane's first or last point
 * (`end`: the first for the start of a path, the last for its target); `anchor:<object id>/<anchor id>`,
 * the anchor's ground point after rotation. `null` when the lane, object or anchor does not exist.
 */
export function resolvePoint(scene: Scene, ref: PointRef, end: "first" | "last"): ResolvedPoint | null {
  if (typeof ref !== "string") return { at: ref, object: null };
  const laneId = laneRefId(ref);
  if (laneId !== null) {
    const points = (scene.lanes ?? []).find((l) => l.id === laneId)?.points;
    const at = end === "first" ? points?.[0] : points?.[points.length - 1];
    return at === undefined ? null : { at, object: null };
  }
  const found = parseAnchorRef(scene, ref);
  if (found === null) return null;
  return { at: worldPoint(scene, found.object, found.anchor.at[0], found.anchor.at[1]), object: found.object.id };
}
