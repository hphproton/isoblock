import { typeColors, laneColor, stripColor, zoneColor } from "./colors";
import { drawOrder } from "./drawOrder";
import { EPS, worldParts, type Box } from "./geometry";
import { cameraDirection, inverse, project } from "./projection";
import type { Scene, Vec2 } from "./types";

export type Layer = "frame" | "strip" | "zone" | "lane" | "object" | "region" | "label";

export interface DisplayPolygon {
  readonly kind: "polygon";
  readonly layer: Layer;
  readonly ref: string;
  readonly points: readonly Vec2[];
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly opacity: number;
  readonly dashed: boolean;
}

export type LabelTarget = "strip" | "lane" | "region" | "object";

export interface DisplayLabel {
  readonly kind: "label";
  readonly layer: "label";
  /** What the label names. */
  readonly target: LabelTarget;
  readonly align: "start" | "middle" | "end";
  readonly ref: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export type DisplayItem = DisplayPolygon | DisplayLabel;

/** Everything a renderer needs, in draw order. The core never draws; renderers do. */
export interface DisplayList {
  readonly width: number;
  readonly height: number;
  readonly items: readonly DisplayItem[];
}

interface Style {
  readonly fill: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly opacity?: number;
  readonly dashed?: boolean;
}

function polygon(layer: Layer, ref: string, points: readonly Vec2[], style: Style): DisplayPolygon {
  return {
    kind: "polygon",
    layer,
    ref,
    points,
    fill: style.fill,
    stroke: style.stroke ?? "#777777",
    strokeWidth: style.strokeWidth ?? 1,
    opacity: style.opacity ?? 1,
    dashed: style.dashed ?? false,
  };
}

function label(target: LabelTarget, ref: string, text: string, at: Vec2, align: DisplayLabel["align"] = "start"): DisplayLabel {
  return { kind: "label", layer: "label", target, align, ref, text, x: at[0], y: at[1] };
}

/** Ground rectangle (u0, v0, u1, v1) that covers the whole frame, for strips that have no end. */
function groundExtent(scene: Scene): readonly [number, number, number, number] {
  const { w, h } = scene.frame;
  const corners = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => inverse(scene.camera, x as number, y as number, 0));
  const us = corners.map((c) => c[0]);
  const vs = corners.map((c) => c[1]);
  return [Math.min(...us) - 1, Math.min(...vs) - 1, Math.max(...us) + 1, Math.max(...vs) + 1];
}

function ground(scene: Scene, points: readonly Vec2[]): Vec2[] {
  return points.map(([u, v]) => project(scene.camera, u, v, 0));
}

/** Screen point near the right frame edge on the ground line `v = const`. */
function rightEdgePoint(scene: Scene, v: number): Vec2 {
  const x = scene.frame.w - 8;
  const a = project(scene.camera, 0, v, 0);
  const b = project(scene.camera, 1, v, 0);
  if (Math.abs(b[0] - a[0]) <= EPS) return [x, a[1] - 6];
  const p = project(scene.camera, (x - a[0]) / (b[0] - a[0]), v, 0);
  return [p[0], p[1] - 6];
}

function stripItems(scene: Scene): DisplayItem[] {
  const [u0, vMin, u1, vMax] = groundExtent(scene);
  return (scene.strips ?? []).flatMap((s) => {
    const lo = s.v[0] ?? vMin;
    const hi = s.v[1] ?? vMax;
    const quad = ground(scene, [[u0, lo], [u1, lo], [u1, hi], [u0, hi]]);
    return [
      polygon("strip", s.id, quad, { fill: stripColor(s.kind) }),
      label("strip", s.id, s.id, rightEdgePoint(scene, (lo + hi) / 2), "end"),
    ];
  });
}

function zoneItems(scene: Scene): DisplayItem[] {
  return (scene.zones ?? []).flatMap((z) =>
    z.points === undefined
      ? []
      : [polygon("zone", z.id, ground(scene, z.points), { fill: zoneColor(z.kind), opacity: 0.45, dashed: true })],
  );
}

function laneItems(scene: Scene): DisplayItem[] {
  return (scene.lanes ?? []).flatMap((lane) => {
    const style: Style = { fill: laneColor(lane.kind), opacity: 0.7 };
    const half = lane.width / 2;
    const quads: DisplayItem[] = [];
    for (let i = 0; i + 1 < lane.points.length; i++) {
      const [pu, pv] = lane.points[i] as Vec2;
      const [qu, qv] = lane.points[i + 1] as Vec2;
      const length = Math.hypot(qu - pu, qv - pv);
      if (length <= EPS) continue;
      const nu = (-(qv - pv) / length) * half;
      const nv = ((qu - pu) / length) * half;
      const quad: Vec2[] = [[pu + nu, pv + nv], [qu + nu, qv + nv], [qu - nu, qv - nv], [pu - nu, pv - nv]];
      quads.push(polygon("lane", lane.id, ground(scene, quad), style));
    }
    const first = lane.points[0] as Vec2;
    return [...quads, label("lane", lane.id, lane.id, project(scene.camera, first[0], first[1], 0))];
  });
}

/** Faces of a box that point toward the camera, as screen polygons, with a shade each. */
function faces(scene: Scene, box: Box, c: readonly [number, number, number]) {
  const p = (u: number, v: number, h: number) => project(scene.camera, u, v, h);
  const out: { points: Vec2[]; shade: "top" | "sideU" | "sideV" }[] = [];
  const u = c[0] > 0 ? box.u1 : box.u0;
  const v = c[1] > 0 ? box.v1 : box.v0;
  if (Math.abs(c[0]) > EPS) {
    out.push({ shade: "sideU", points: [p(u, box.v0, box.h0), p(u, box.v1, box.h0), p(u, box.v1, box.h1), p(u, box.v0, box.h1)] });
  }
  if (Math.abs(c[1]) > EPS) {
    out.push({ shade: "sideV", points: [p(box.u0, v, box.h0), p(box.u1, v, box.h0), p(box.u1, v, box.h1), p(box.u0, v, box.h1)] });
  }
  out.push({ shade: "top", points: [p(box.u0, box.v0, box.h1), p(box.u1, box.v0, box.h1), p(box.u1, box.v1, box.h1), p(box.u0, box.v1, box.h1)] });
  return out;
}

function objectItems(scene: Scene): { boxes: DisplayItem[]; labels: DisplayItem[] } {
  const c = cameraDirection(scene.camera);
  const parts = scene.objects.flatMap((o) => worldParts(scene, o).map((part) => ({ object: o, box: part.box })));
  const boxes = drawOrder(parts.map((x) => x.box), scene.camera).flatMap((index) => {
    const { object, box } = parts[index] as (typeof parts)[number];
    const colors = typeColors(object.type);
    return faces(scene, box, c).map((f) => polygon("object", object.id, f.points, { fill: colors[f.shade], stroke: colors.edge }));
  });
  const labels = scene.objects.map((o) => {
    const top = Math.max(...worldParts(scene, o).map((x) => x.box.h1));
    const f = worldParts(scene, o).map((x) => x.box);
    const u = (Math.min(...f.map((b) => b.u0)) + Math.max(...f.map((b) => b.u1))) / 2;
    const v = (Math.min(...f.map((b) => b.v0)) + Math.max(...f.map((b) => b.v1))) / 2;
    return label("object", o.id, o.id, project(scene.camera, u, v, top), "middle");
  });
  return { boxes, labels };
}

function regionItems(scene: Scene): DisplayItem[] {
  return scene.frame.regions.flatMap((r) => {
    const [x0, y0, x1, y1] = r.rect;
    const blocks = r.blocksScene === true;
    return [
      polygon("region", r.id, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], {
        fill: blocks ? "#444444" : "none",
        stroke: blocks ? "#444444" : "#2a6f97",
        strokeWidth: 2,
        opacity: blocks ? 0.3 : 1,
        dashed: !blocks,
      }),
      label("region", r.id, r.id, [x0 + 6, y0 + 16]),
    ];
  });
}

/** Build the display list for a scene: ground, objects back to front, region outlines, labels. */
export function buildDisplayList(scene: Scene): DisplayList {
  const { w, h } = scene.frame;
  const objects = objectItems(scene);
  const strips = stripItems(scene);
  const lanes = laneItems(scene);
  const regions = regionItems(scene);
  const frame = polygon("frame", scene.id, [[0, 0], [w, 0], [w, h], [0, h]], { fill: "#fbfaf6", stroke: "#999999" });
  const shapes = (items: readonly DisplayItem[]) => items.filter((i) => i.kind === "polygon");
  const labels = (items: readonly DisplayItem[]) => items.filter((i) => i.kind === "label");
  return {
    width: w,
    height: h,
    items: [
      frame,
      ...shapes(strips),
      ...shapes(zoneItems(scene)),
      ...shapes(lanes),
      ...objects.boxes,
      ...shapes(regions),
      ...labels(strips),
      ...labels(lanes),
      ...labels(regions),
      ...objects.labels,
    ],
  };
}
