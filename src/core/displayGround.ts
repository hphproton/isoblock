import { pointHeight } from "./checks/laneShape";
import { laneColor, stripColor, zoneColor } from "./colors";
import { label, polygon, type DisplayLabel, type DisplayPolygon, type Style } from "./displayTypes";
import { EPS } from "./geometry";
import { inverse, project } from "./projection";
import type { Camera, Scene, Vec2 } from "./types";

/** Ground rectangle `[u0, v0, u1, v1]`. */
export type GroundExtent = readonly [number, number, number, number];

/** What the display list draws for the frame, strips, zones, lanes and regions. */
export interface GroundItems {
  /** Frame background, strips, zones and lanes: drawn under the objects. */
  readonly under: readonly DisplayPolygon[];
  /** Region outlines: drawn over the objects. */
  readonly outlines: readonly DisplayPolygon[];
  /** Strip, lane and region labels, in that order. */
  readonly labels: readonly DisplayLabel[];
}

/** Ground rectangle that covers the whole frame, for strips that have no end. */
export function frameExtent(scene: Scene): GroundExtent {
  const { w, h } = scene.frame;
  const corners = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => inverse(scene.camera, x as number, y as number, 0));
  const us = corners.map((c) => c[0]);
  const vs = corners.map((c) => c[1]);
  return [Math.min(...us) - 1, Math.min(...vs) - 1, Math.max(...us) + 1, Math.max(...vs) + 1];
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

/**
 * Items of the ground layers for one view. The scene camera draws frame rectangles as they are;
 * any other camera maps frame pixels through the ground (SPEC section 5, inverse projection).
 */
export function groundItems(scene: Scene, camera: Camera, extent: GroundExtent): GroundItems {
  const own = camera === scene.camera;
  const onPlane = (points: readonly (readonly number[])[], h: number | readonly number[]): Vec2[] =>
    points.map((p, i) => project(camera, p[0] as number, p[1] as number, typeof h === "number" ? h : (h[i] as number)));
  const fromFrame = (p: Vec2): Vec2 => {
    if (own) return p;
    const [u, v] = inverse(scene.camera, p[0], p[1], 0);
    return project(camera, u, v, 0);
  };
  const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] =>
    ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Vec2[]).map(fromFrame);

  const [u0, vMin, u1, vMax] = extent;
  const under: DisplayPolygon[] = [
    polygon("frame", scene.id, rect(0, 0, scene.frame.w, scene.frame.h), { fill: "#fbfaf6", stroke: "#999999" }),
  ];
  const stripLabels: DisplayLabel[] = [];
  for (const s of scene.strips ?? []) {
    const lo = s.v[0] ?? vMin;
    const hi = s.v[1] ?? vMax;
    under.push(polygon("strip", s.id, onPlane([[u0, lo], [u1, lo], [u1, hi], [u0, hi]], 0), { fill: stripColor(s.kind) }));
    const mid = (lo + hi) / 2;
    stripLabels.push(
      own
        ? label("strip", s.id, s.id, rightEdgePoint(scene, mid), "end")
        : label("strip", s.id, s.id, project(camera, u0 + 0.2, mid, 0), "start"),
    );
  }
  const zones = (scene.zones ?? []).map((zone, index) => ({ zone, index }));
  zones.sort((a, b) => (a.zone.h ?? 0) - (b.zone.h ?? 0) || a.index - b.index);
  for (const { zone } of zones) {
    if (zone.points === undefined) continue;
    under.push(polygon("zone", zone.id, onPlane(zone.points, zone.h ?? 0), { fill: zoneColor(zone.kind), opacity: 0.45, dashed: true }));
  }
  const laneLabels: DisplayLabel[] = [];
  for (const lane of scene.lanes ?? []) {
    const style: Style = { fill: laneColor(lane.kind), opacity: 0.7 };
    const half = lane.width / 2;
    for (let i = 0; i + 1 < lane.points.length; i++) {
      const p = lane.points[i] as readonly number[];
      const q = lane.points[i + 1] as readonly number[];
      const [pu, pv] = p;
      const [qu, qv] = q;
      const length = Math.hypot((qu as number) - (pu as number), (qv as number) - (pv as number));
      if (length <= EPS) continue;
      const nu = (-((qv as number) - (pv as number)) / length) * half;
      const nv = (((qu as number) - (pu as number)) / length) * half;
      const quad = [[(pu as number) + nu, (pv as number) + nv], [(qu as number) + nu, (qv as number) + nv], [(qu as number) - nu, (qv as number) - nv], [(pu as number) - nu, (pv as number) - nv]];
      const ph = pointHeight(lane, p);
      const qh = pointHeight(lane, q);
      under.push(polygon("lane", lane.id, onPlane(quad, [ph, qh, qh, ph]), style));
    }
    const first = lane.points[0] as readonly number[];
    laneLabels.push(label("lane", lane.id, lane.id, project(camera, first[0] as number, first[1] as number, pointHeight(lane, first))));
  }
  const outlines: DisplayPolygon[] = [];
  const regionLabels: DisplayLabel[] = [];
  const hiddenRegions = new Set(scene.hiddenRegions ?? []);
  for (const r of scene.frame.regions) {
    if (hiddenRegions.has(r.id)) continue;
    const [x0, y0, x1, y1] = r.rect;
    const blocks = r.blocksScene === true;
    outlines.push(
      polygon("region", r.id, rect(x0, y0, x1, y1), {
        fill: blocks ? "#444444" : "none",
        stroke: blocks ? "#444444" : "#2a6f97",
        strokeWidth: 2,
        opacity: blocks ? 0.3 : 1,
        dashed: !blocks,
      }),
    );
    regionLabels.push(label("region", r.id, r.id, fromFrame([x0 + 6, y0 + 16])));
  }
  return { under, outlines, labels: [...stripLabels, ...laneLabels, ...regionLabels] };
}
