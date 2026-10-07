import { typeColors, zoneColor } from "./colors";
import { label, polygon, type DisplayLabel, type DisplayPolygon } from "./displayTypes";
import { boxInfo, orderInfos, type BoxInfo } from "./drawOrder";
import { EPS, worldParts, worldPoint, type Box } from "./geometry";
import { orderDirection, projector } from "./projection";
import type { Camera, ObjectType, Scene, SceneObject, Vec2, Vec3 } from "./types";

/** Everything the display list draws for one object, kept between frames. */
export interface ObjectEntry {
  /** Definition of the object's type when the entry was built. */
  readonly type: ObjectType | undefined;
  readonly infos: readonly BoxInfo[];
  /** Face polygons, one list per part. */
  readonly faces: readonly (readonly DisplayPolygon[])[];
  readonly label: DisplayLabel;
}

type Project = (u: number, v: number, h: number) => Vec2;

type Shade = "top" | "sideU" | "sideV";

/** Faces of a box that point toward the camera, as screen polygons, with a shade each. */
function boxFaces(at: Project, box: Box, c: Vec3): { points: Vec2[]; shade: Shade }[] {
  const out: { points: Vec2[]; shade: Shade }[] = [];
  const u = c[0] > 0 ? box.u1 : box.u0;
  const v = c[1] > 0 ? box.v1 : box.v0;
  if (Math.abs(c[0]) > EPS) {
    out.push({ shade: "sideU", points: [at(u, box.v0, box.h0), at(u, box.v1, box.h0), at(u, box.v1, box.h1), at(u, box.v0, box.h1)] });
  }
  if (Math.abs(c[1]) > EPS) {
    out.push({ shade: "sideV", points: [at(box.u0, v, box.h0), at(box.u1, v, box.h0), at(box.u1, v, box.h1), at(box.u0, v, box.h1)] });
  }
  out.push({ shade: "top", points: [at(box.u0, box.v0, box.h1), at(box.u1, box.v0, box.h1), at(box.u1, box.v1, box.h1), at(box.u0, box.v1, box.h1)] });
  return out;
}

export function buildEntry(scene: Scene, object: SceneObject, camera: Camera, c: Vec3): ObjectEntry {
  const at = projector(camera);
  const parts = worldParts(scene, object);
  const colors = typeColors(object.type);
  const boxes = parts.map((p) => p.box);
  const u = (Math.min(...boxes.map((b) => b.u0)) + Math.max(...boxes.map((b) => b.u1))) / 2;
  const v = (Math.min(...boxes.map((b) => b.v0)) + Math.max(...boxes.map((b) => b.v1))) / 2;
  const top = Math.max(...boxes.map((b) => b.h1));
  return {
    type: scene.types[object.type],
    infos: boxes.map((b) => boxInfo(b, camera, c)),
    faces: boxes.map((b) =>
      boxFaces(at, b, c).map((f) => polygon("object", object.id, f.points, { fill: colors[f.shade], stroke: colors.edge })),
    ),
    label: label("object", object.id, object.id, at(u, v, top), "middle"),
  };
}

/**
 * Entries by object. Objects are compared by reference, so an edited object gets a new entry, and
 * entries of objects that are gone are released with them.
 */
export interface ObjectCache {
  camera: Camera | null;
  entries: WeakMap<SceneObject, ObjectEntry>;
}

/** Object polygons back to front, and one label per object. Unchanged objects come from the cache. */
export function objectItems(
  scene: Scene,
  camera: Camera,
  cache: ObjectCache,
): { readonly boxes: readonly DisplayPolygon[]; readonly labels: readonly DisplayLabel[] } {
  const c = orderDirection(camera);
  if (cache.camera !== camera) {
    cache.entries = new WeakMap();
    cache.camera = camera;
  }
  const entries = scene.objects.map((o) => {
    const known = cache.entries.get(o);
    if (known !== undefined && known.type === scene.types[o.type]) return known;
    const entry = buildEntry(scene, o, camera, c);
    cache.entries.set(o, entry);
    return entry;
  });
  const infos: BoxInfo[] = [];
  const faces: (readonly DisplayPolygon[])[] = [];
  for (const entry of entries) {
    for (let k = 0; k < entry.infos.length; k++) {
      infos.push(entry.infos[k] as BoxInfo);
      faces.push(entry.faces[k] as readonly DisplayPolygon[]);
    }
  }
  const boxes: DisplayPolygon[] = [];
  for (const index of orderInfos(infos, c)) boxes.push(...(faces[index] as readonly DisplayPolygon[]));
  return { boxes, labels: entries.map((e) => e.label) };
}

const ANCHOR_RADIUS = 5;

/** A marker and a label for every anchor of every object, rotated with the object. */
export function anchorItems(
  scene: Scene,
  camera: Camera,
): { readonly marks: readonly DisplayPolygon[]; readonly labels: readonly DisplayLabel[] } {
  const at = projector(camera);
  const marks: DisplayPolygon[] = [];
  const labels: DisplayLabel[] = [];
  for (const o of scene.objects) {
    for (const a of scene.types[o.type]?.anchors ?? []) {
      const [u, v] = worldPoint(scene, o, a.at[0], a.at[1]);
      const [x, y] = at(u, v, a.at[2]);
      const r = ANCHOR_RADIUS;
      const diamond: Vec2[] = [[x, y - r], [x + r, y], [x, y + r], [x - r, y]];
      marks.push(polygon("anchor", o.id, diamond, { fill: zoneColor(a.kind ?? "anchor"), stroke: "#222222", strokeWidth: 1.5 }));
      labels.push(label("anchor", o.id, a.id, [x + r + 3, y + 4]));
    }
  }
  return { marks, labels };
}
