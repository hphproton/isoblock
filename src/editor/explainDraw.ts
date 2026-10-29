import { typeRgb } from "../core/colors";
import { baseHeight, footprint, worldParts, type Box } from "../core/geometry";
import { planCamera } from "../core/planView";
import { project } from "../core/projection";
import { facingFigure } from "../core/relations/facing";
import { FACING_SHAFT, traceArrowHead } from "./facingArrow";
import { resolveTarget } from "../core/relations/targets";
import { evaluateRelations } from "../core/relations/evaluate";
import type { Camera, Relation, Scene, Vec2, Vec3 } from "../core/types";
import type { ObjectRaster } from "../core/raster/raster";
import type { Viewport } from "../core/viewport";
import { raySamples, sortPointRows } from "./overlayData";
import { sceneShown } from "./shown";
import { currentScene, type EditorState } from "./store";

const SATISFIED = "#2a7d3f";
const VIOLATED = "#b3261e";
const GHOST = "#1d6fa5";
const RAY = "#c45c26";
const MARK = "#7a2f12";

const bitmaps = new WeakMap<ObjectRaster, { selected: string | null; canvas: HTMLCanvasElement }>();

function cameraOf(kind: "iso" | "plan", scene: Scene): Camera {
  return kind === "iso" ? scene.camera : planCamera();
}

function line(ctx: CanvasRenderingContext2D, camera: Camera, points: readonly Vec3[]): void {
  const first = points[0];
  if (first === undefined) return;
  ctx.beginPath();
  const start = project(camera, first[0], first[1], first[2]);
  ctx.moveTo(start[0], start[1]);
  for (const point of points.slice(1)) {
    const at = project(camera, point[0], point[1], point[2]);
    ctx.lineTo(at[0], at[1]);
  }
  ctx.stroke();
}

function boxEdges(box: Box): readonly (readonly [Vec3, Vec3])[] {
  const c: Vec3[] = [
    [box.u0, box.v0, box.h0], [box.u1, box.v0, box.h0], [box.u1, box.v1, box.h0], [box.u0, box.v1, box.h0],
    [box.u0, box.v0, box.h1], [box.u1, box.v0, box.h1], [box.u1, box.v1, box.h1], [box.u0, box.v1, box.h1],
  ];
  const pairs = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  return pairs.map(([a, b]) => [c[a] as Vec3, c[b] as Vec3]);
}

function strokeBox(ctx: CanvasRenderingContext2D, camera: Camera, box: Box): void {
  ctx.beginPath();
  for (const [a, b] of boxEdges(box)) {
    const from = project(camera, a[0], a[1], a[2]);
    const to = project(camera, b[0], b[1], b[2]);
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
  }
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, camera: Camera, at: Vec3, radius: number): void {
  const [x, y] = project(camera, at[0], at[1], at[2]);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function center(scene: Scene, id: string): Vec2 | null {
  const object = scene.objects.find((item) => item.id === id);
  if (object === undefined) return null;
  const box = footprint(scene, object);
  return [(box.u0 + box.u1) / 2, (box.v0 + box.v1) / 2];
}

function nearestOnSegment(origin: Vec2, a: Vec2, b: Vec2): Vec2 {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const length = abx * abx + aby * aby;
  if (length <= 1e-12) return a;
  const t = Math.max(0, Math.min(1, ((origin[0] - a[0]) * abx + (origin[1] - a[1]) * aby) / length));
  return [a[0] + t * abx, a[1] + t * aby];
}

function nearest(origin: Vec2, points: readonly (readonly number[])[], closed: boolean): Vec2 {
  const count = points.length;
  let best = origin;
  let bestD = Infinity;
  const edges = closed ? count : Math.max(0, count - 1);
  for (let i = 0; i < edges; i++) {
    const a = points[i] as readonly number[];
    const b = points[(i + 1) % count] as readonly number[];
    const point = nearestOnSegment(origin, [a[0] as number, a[1] as number], [b[0] as number, b[1] as number]);
    const d = (point[0] - origin[0]) ** 2 + (point[1] - origin[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = point;
    }
  }
  return best;
}

function targetPoint(scene: Scene, relation: Relation, from: Vec2): Vec3 | null {
  if (relation.rel === "order_along") return null;
  const target = resolveTarget(scene, relation.b);
  if (target.kind === "object") {
    const at = center(scene, target.name);
    return at === null ? null : [at[0], at[1], 0];
  }
  if (target.kind === "lane") return [...nearest(from, target.lane.points, false), 0];
  if (target.kind === "zone") return [...nearest(from, target.zone.points ?? [], true), 0];
  if (target.kind === "strip" && target.bound !== null) return [from[0], target.bound, 0];
  return null;
}

function relationLines(scene: Scene): { id: string; hard: boolean; violated: boolean; points: Vec3[]; arrow: readonly [Vec3, Vec3] | null }[] {
  const results = evaluateRelations(scene).results;
  const byId = new Map((scene.relations ?? []).map((relation) => [relation.id, relation]));
  const lines: { id: string; hard: boolean; violated: boolean; points: Vec3[]; arrow: readonly [Vec3, Vec3] | null }[] = [];
  for (const result of results) {
    if (result.status === "skip") continue;
    const relation = byId.get(result.id);
    if (relation === undefined) continue;
    const row = { id: relation.id, hard: result.hard, violated: result.status === "violated", arrow: null };
    if (relation.rel === "facing") {
      const figure = facingFigure(scene, resolveTarget(scene, relation.a), resolveTarget(scene, relation.b));
      if (figure === null) continue;
      const from: Vec3 = [figure.from[0], figure.from[1], 0];
      const to: Vec3 = [figure.to[0], figure.to[1], 0];
      const tip: Vec3 = [figure.from[0] + figure.front[0] * FACING_SHAFT, figure.from[1] + figure.front[1] * FACING_SHAFT, 0];
      lines.push({ ...row, points: [from, to], arrow: [from, tip] });
      continue;
    }
    if (relation.rel === "order_along") {
      const points = (relation.ids ?? []).flatMap((id) => {
        const at = center(scene, id);
        return at === null ? [] : [[at[0], at[1], 0] as Vec3];
      });
      if (points.length >= 2) lines.push({ ...row, points });
      continue;
    }
    const from = relation.a === undefined ? null : center(scene, relation.a);
    if (from === null) continue;
    const to = targetPoint(scene, relation, from);
    if (to === null) continue;
    lines.push({ ...row, points: [[from[0], from[1], 0], to] });
  }
  return lines;
}

function maskBitmap(raster: ObjectRaster, scene: Scene, selected: string | null): HTMLCanvasElement {
  const known = bitmaps.get(raster);
  if (known !== undefined && known.selected === selected) return known.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return canvas;
  const image = ctx.createImageData(raster.width, raster.height);
  const data = image.data;
  const colors = scene.objects.map((object) => typeRgb(object.type));
  const selectedSlot = scene.objects.findIndex((object) => object.id === selected);
  const full = selectedSlot >= 0 ? raster.full[selectedSlot] : undefined;
  for (let i = 0; i < raster.labels.length; i++) {
    const label = raster.labels[i] ?? 0;
    if (label === 0) continue;
    const slot = label - 1;
    const covered = full !== undefined && full[i] === 1 && slot !== selectedSlot;
    const rgb = covered ? [160, 40, 32] : colors[slot] ?? [120, 120, 120];
    const offset = i * 4;
    data[offset] = rgb[0] as number;
    data[offset + 1] = rgb[1] as number;
    data[offset + 2] = rgb[2] as number;
    data[offset + 3] = covered ? 190 : 120;
  }
  ctx.putImageData(image, 0, 0);
  bitmaps.set(raster, { selected, canvas });
  return canvas;
}

function paintMasks(ctx: CanvasRenderingContext2D, state: EditorState, scene: Scene): void {
  const raster = state.maskRaster;
  if (!state.overlays.masks || raster === null) return;
  const view = sceneShown(scene, state.shownState);
  ctx.drawImage(maskBitmap(raster, view, state.selected), 0, 0);
}

function paintRelations(ctx: CanvasRenderingContext2D, camera: Camera, scale: number, state: EditorState, scene: Scene): void {
  if (!state.overlays.relations) return;
  const lines = relationLines(scene);
  const highlighted = lines.filter((item) => item.id === state.highlightRelation);
  const rest = lines.filter((item) => item.id !== state.highlightRelation);
  ctx.lineCap = "round";
  for (const item of [...rest, ...highlighted]) {
    const color = item.violated ? VIOLATED : SATISFIED;
    ctx.strokeStyle = color;
    ctx.lineWidth = (item.violated && item.hard ? 3.5 : 1.6) / scale;
    line(ctx, camera, item.points);
    if (item.arrow !== null) {
      line(ctx, camera, item.arrow);
      ctx.fillStyle = color;
      traceArrowHead(camera, item.arrow[0], item.arrow[1], scale, ctx);
    }
    const mid = item.points[Math.floor(item.points.length / 2)] as Vec3;
    const at = project(camera, mid[0], mid[1], mid[2]);
    ctx.font = `${11 / scale}px sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(item.id, at[0], at[1]);
  }
}

function paintSortPoints(ctx: CanvasRenderingContext2D, camera: Camera, scale: number, state: EditorState, scene: Scene): void {
  if (!state.overlays.sortPoints) return;
  ctx.fillStyle = "#1d6fa5";
  for (const row of sortPointRows(scene, state.shownState)) {
    dot(ctx, camera, [row.point[0], row.point[1], row.point[2]], 3.5 / scale);
    if (row.object === state.selected) {
      const at = project(camera, row.point[0], row.point[1], row.point[2]);
      ctx.font = `${11 / scale}px sans-serif`;
      ctx.fillStyle = "#1a1a1a";
      ctx.fillText(String(row.key), at[0] + 5 / scale, at[1]);
      ctx.fillStyle = "#1d6fa5";
    }
  }
}

function paintRays(ctx: CanvasRenderingContext2D, camera: Camera, scale: number, state: EditorState, scene: Scene): void {
  if (!state.overlays.rays) return;
  const rays = raySamples(scene, state.shownState, state.highlightCheck, state.results);
  for (const sample of rays.samples) {
    ctx.fillStyle = sample.occluded ? RAY : "#2a7d3f";
    dot(ctx, camera, [sample.at[0], sample.at[1], sample.at[2]], 2.5 / scale);
    if (sample.occluded && sample.leave !== null) {
      ctx.strokeStyle = RAY;
      ctx.lineWidth = 1 / scale;
      line(ctx, camera, [[sample.at[0], sample.at[1], sample.at[2]], sample.leave]);
    }
  }
}

function paintOccluders(ctx: CanvasRenderingContext2D, camera: Camera, scale: number, kind: "iso" | "plan", state: EditorState, scene: Scene): void {
  const report = state.occludersReport;
  if (state.occluder.area === "" || report === null) return;
  const view = sceneShown(scene, state.shownState);
  const ids = new Set(report.occluders.map((row) => row.id));
  ctx.strokeStyle = RAY;
  ctx.lineWidth = 2 / scale;
  for (const object of view.objects) {
    if (!ids.has(object.id)) continue;
    for (const part of worldParts(view, object)) strokeBox(ctx, camera, part.box);
  }
  if (kind !== "plan") return;
  ctx.fillStyle = MARK;
  const mark = report.area.level ?? 0;
  for (const [u, v] of state.occluderPoints) dot(ctx, camera, [u, v, mark], 2 / scale);
}

function paintGhosts(ctx: CanvasRenderingContext2D, camera: Camera, scale: number, state: EditorState, scene: Scene): void {
  const proposal = state.proposal;
  if (proposal === null) return;
  const shown = sceneShown(scene, state.shownState);
  const moved = new Map(proposal.report.moved.map((item) => [item.id, item.to]));
  const turned = new Map((proposal.report.turned ?? []).map((item) => [item.id, item.to]));
  if (moved.size === 0 && turned.size === 0) return;
  const ghost: Scene = {
    ...shown,
    objects: shown.objects.map((object) => {
      const pos = moved.get(object.id);
      const rot = turned.get(object.id);
      if (pos === undefined && rot === undefined) return object;
      return { ...object, ...(pos === undefined ? {} : { pos }), ...(rot === undefined ? {} : { rot }) };
    }),
  };
  ctx.strokeStyle = GHOST;
  ctx.setLineDash([6 / scale, 4 / scale]);
  ctx.lineWidth = 1.5 / scale;
  for (const object of ghost.objects) {
    if (!moved.has(object.id) && !turned.has(object.id)) continue;
    for (const part of worldParts(ghost, object)) strokeBox(ctx, camera, part.box);
    const before = shown.objects.find((item) => item.id === object.id);
    if (before === undefined) continue;
    const from = footprint(shown, before);
    const to = footprint(ghost, object);
    const h = baseHeight(object);
    line(ctx, camera, [
      [(from.u0 + from.u1) / 2, (from.v0 + from.v1) / 2, h],
      [(to.u0 + to.u1) / 2, (to.v0 + to.v1) / 2, h],
    ]);
  }
  ctx.setLineDash([]);
}

/** Draw the stage 14 overlays on top of a view. The transform is display space. */
export function paintExplanations(
  ctx: CanvasRenderingContext2D,
  kind: "iso" | "plan",
  state: EditorState,
  viewport: Viewport,
  dpr: number,
): void {
  const scene = currentScene(state);
  if (scene === null) return;
  const active = state.proposal !== null || state.overlays.relations || state.overlays.sortPoints || state.overlays.rays || state.overlays.masks || state.occluder.area !== "";
  if (!active) return;
  ctx.save();
  ctx.setTransform(dpr * viewport.scale, 0, 0, dpr * viewport.scale, dpr * viewport.tx, dpr * viewport.ty);
  const camera = cameraOf(kind, scene);
  if (kind === "iso") paintMasks(ctx, state, scene);
  paintRelations(ctx, camera, viewport.scale, state, scene);
  paintSortPoints(ctx, camera, viewport.scale, state, scene);
  if (kind === "iso") paintRays(ctx, camera, viewport.scale, state, scene);
  paintOccluders(ctx, camera, viewport.scale, kind, state, scene);
  paintGhosts(ctx, camera, viewport.scale, state, scene);
  ctx.restore();
}

/** True when a partial repaint could clip an explanation. */
export function explanationsOn(state: EditorState): boolean {
  return state.proposal !== null || state.overlays.relations || state.overlays.sortPoints || state.overlays.rays || state.overlays.masks || state.occluder.area !== "";
}
