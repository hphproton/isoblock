import type { DisplayItem, DisplayPolygon } from "../core/displayList";
import { lockedAxes } from "../core/locks";
import type { Scene, SceneObject } from "../core/types";
import type { Bounds, Viewport } from "../core/viewport";
import type { OverlayName } from "./store";

export interface DrawParams {
  readonly items: readonly DisplayItem[];
  readonly scene: Scene;
  readonly viewport: Viewport;
  /** Canvas size in CSS pixels, and the pixel ratio of the backing store. */
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly overlays: Readonly<Record<OverlayName, boolean>>;
  readonly selected: string | null;
  readonly highlight: ReadonlySet<string>;
  readonly cache: DrawCache;
  /** Display rectangles to repaint. Everything outside them is left as it is. Default: the whole canvas. */
  readonly clip?: readonly Bounds[];
}

/** Paths kept between frames, so that an unchanged polygon is not turned into a path again. */
export interface DrawCache {
  readonly paths: WeakMap<DisplayPolygon, Path2D>;
  /** The stroke path of a run of polygons, by its first polygon. */
  readonly runs: WeakMap<DisplayPolygon, { readonly members: readonly DisplayPolygon[]; readonly path: Path2D }>;
}

export function createDrawCache(): DrawCache {
  return { paths: new WeakMap(), runs: new WeakMap() };
}

/** What the last frame drew that tests and tools want to know about. */
export interface DrawReport {
  /** Ids of the objects that show a lock icon. */
  readonly locks: readonly string[];
}

const BACKDROP = "#e9e7de";
const SELECT = "#1d6fa5";
const HIGHLIGHT = "#e0a400";
/** How far (CSS pixels) a label or lock icon may reach beyond the point it hangs from. */
const LABEL_REACH = { x: 160, y: 36 };
/** Strokes reach a little beyond the polygon (CSS pixels). */
const STROKE_REACH = 4;

function pathOf(polygon: DisplayPolygon, cache: DrawCache): Path2D {
  let path = cache.paths.get(polygon);
  if (path === undefined) {
    path = new Path2D();
    const [first, ...rest] = polygon.points;
    if (first !== undefined) path.moveTo(first[0], first[1]);
    for (const [x, y] of rest) path.lineTo(x, y);
    path.closePath();
    cache.paths.set(polygon, path);
  }
  return path;
}

/** True when `b` continues a run that starts at `a`: faces of one object drawn with the same stroke. */
function continuesRun(a: DisplayPolygon, b: DisplayPolygon): boolean {
  return b.layer === "object" && a.layer === "object" && b.ref === a.ref && b.stroke === a.stroke &&
    b.strokeWidth === a.strokeWidth && b.opacity === a.opacity;
}

/** One path that strokes every polygon of a run, so that the run costs one stroke instead of several. */
function runPath(polygons: readonly DisplayPolygon[], from: number, to: number, cache: DrawCache): Path2D {
  const first = polygons[from] as DisplayPolygon;
  const known = cache.runs.get(first);
  const members = polygons.slice(from, to);
  if (known !== undefined && known.members.length === members.length && known.members.every((m, i) => m === members[i])) {
    return known.path;
  }
  const path = new Path2D();
  for (const m of members) path.addPath(pathOf(m, cache));
  cache.runs.set(first, { members, path });
  return path;
}

function layerOn(polygon: DisplayPolygon, on: DrawParams["overlays"]): boolean {
  switch (polygon.layer) {
    case "strip": return on.strips;
    case "zone": return on.zones;
    case "lane": return on.lanes;
    case "region": return on.regions;
    case "anchor": return on.anchors;
    default: return true;
  }
}

/** The polygons to paint, in draw order: layers that are on, and touching one of the rectangles if there are any. */
function visiblePolygons(p: DrawParams, rects: readonly Bounds[] | undefined): DisplayPolygon[] {
  const out: DisplayPolygon[] = [];
  for (const item of p.items) {
    if (item.kind !== "polygon" || !layerOn(item, p.overlays)) continue;
    if (rects !== undefined) {
      const [x0, y0, x1, y1] = item.bounds;
      if (!rects.some((r) => x1 >= r.x0 && x0 <= r.x1 && y1 >= r.y0 && y0 <= r.y1)) continue;
    }
    out.push(item);
  }
  return out;
}

function paintPolygons(ctx: CanvasRenderingContext2D, polygons: readonly DisplayPolygon[], p: DrawParams): void {
  const { scale } = p.viewport;
  ctx.lineJoin = "miter";
  let fill = "";
  let stroke = "";
  let width = -1;
  let alpha = 1;
  let dashed = false;
  let i = 0;
  while (i < polygons.length) {
    const item = polygons[i] as DisplayPolygon;
    let end = i + 1;
    if (item.layer === "object") while (end < polygons.length && continuesRun(item, polygons[end] as DisplayPolygon)) end++;
    if (item.opacity !== alpha) ctx.globalAlpha = alpha = item.opacity;
    if (item.dashed !== dashed) ctx.setLineDash((dashed = item.dashed) ? [6 / scale, 4 / scale] : []);
    for (let k = i; k < end; k++) {
      const face = polygons[k] as DisplayPolygon;
      if (face.fill === "none") continue;
      if (face.fill !== fill) ctx.fillStyle = fill = face.fill;
      ctx.fill(pathOf(face, p.cache));
    }
    if (item.stroke !== stroke) ctx.strokeStyle = stroke = item.stroke;
    if (item.strokeWidth !== width) ctx.lineWidth = (width = item.strokeWidth) / scale;
    ctx.stroke(end - i === 1 ? pathOf(item, p.cache) : runPath(polygons, i, end, p.cache));
    i = end;
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

function outline(
  ctx: CanvasRenderingContext2D,
  polygons: readonly DisplayPolygon[],
  p: DrawParams,
  refs: ReadonlySet<string>,
  color: string,
  px: number,
): void {
  if (refs.size === 0) return;
  const path = new Path2D();
  let any = false;
  for (const item of polygons) {
    if ((item.layer === "object" || item.layer === "lane") && refs.has(item.ref)) {
      path.addPath(pathOf(item, p.cache));
      any = true;
    }
  }
  if (!any) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = px / p.viewport.scale;
  ctx.lineJoin = "miter";
  ctx.stroke(path);
}

function drawLock(ctx: CanvasRenderingContext2D, x: number, y: number, object: SceneObject): void {
  const axes = lockedAxes(object);
  const both = axes.u && axes.v;
  const color = both ? "#22262b" : axes.u || axes.v ? "#b26a00" : "#6a7480";
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.9;
  ctx.fillRect(-8, -9, 16, 17);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillRect(-5, -1, 10, 8);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, -2, 3.2, Math.PI, 0);
  ctx.stroke();
  if (!both && (axes.u || axes.v)) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(axes.u ? "u" : "v", 0, 5.5);
  }
  ctx.restore();
}

interface CanvasRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Labels and lock icons are drawn in canvas pixels, so that they keep their size when the view zooms. */
function paintLabels(ctx: CanvasRenderingContext2D, p: DrawParams, locked: ReadonlyMap<string, SceneObject>, areas: readonly CanvasRect[] | undefined): void {
  const { scale, tx, ty } = p.viewport;
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  for (const item of p.items) {
    if (item.kind !== "label") continue;
    const x = item.x * scale + tx;
    const y = item.y * scale + ty;
    if (areas !== undefined && !areas.some((a) => x >= a.x0 - LABEL_REACH.x && x <= a.x1 + LABEL_REACH.x && y >= a.y0 - LABEL_REACH.y && y <= a.y1 + LABEL_REACH.y)) {
      continue;
    }
    const object = item.target === "object" ? locked.get(item.ref) : undefined;
    if (object !== undefined) drawLock(ctx, x, y - 16, object);
    const show =
      item.target === "strip" ? p.overlays.strips
      : item.target === "lane" ? p.overlays.lanes
      : item.target === "region" ? p.overlays.regions
      : item.target === "anchor" ? p.overlays.anchors
      : p.overlays.labels || item.ref === p.selected || p.highlight.has(item.ref);
    if (!show) continue;
    ctx.font = item.target === "object" ? "12px sans-serif" : "11px sans-serif";
    ctx.textAlign = item.align === "middle" ? "center" : item.align === "end" ? "right" : "left";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(item.text, x, y);
    ctx.fillStyle = "#22262b";
    ctx.fillText(item.text, x, y);
  }
}

/** A display rectangle in canvas CSS pixels, grown to whole device pixels so that its edge does not blend. */
function canvasRect(p: DrawParams, r: Bounds): CanvasRect {
  const { scale, tx, ty } = p.viewport;
  const { dpr } = p;
  return {
    x0: Math.max(0, Math.floor((r.x0 * scale + tx) * dpr) / dpr),
    y0: Math.max(0, Math.floor((r.y0 * scale + ty) * dpr) / dpr),
    x1: Math.min(p.width, Math.ceil((r.x1 * scale + tx) * dpr) / dpr),
    y1: Math.min(p.height, Math.ceil((r.y1 * scale + ty) * dpr) / dpr),
  };
}

/**
 * Draw a display list on a canvas: layers, selection and highlight outlines, labels, lock icons.
 * With `clip`, only the union of those rectangles is painted again.
 */
export function drawView(ctx: CanvasRenderingContext2D, p: DrawParams): DrawReport {
  const { dpr, viewport: vp } = p;
  const areas = p.clip?.map((r) => canvasRect(p, r));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (areas !== undefined) {
    ctx.save();
    ctx.beginPath();
    for (const a of areas) ctx.rect(a.x0, a.y0, a.x1 - a.x0, a.y1 - a.y0);
    ctx.clip();
  }
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, p.width, p.height);
  ctx.setTransform(dpr * vp.scale, 0, 0, dpr * vp.scale, dpr * vp.tx, dpr * vp.ty);
  const reach = STROKE_REACH / vp.scale;
  const wanted = areas?.map((a) => ({
    x0: (a.x0 - vp.tx) / vp.scale - reach,
    y0: (a.y0 - vp.ty) / vp.scale - reach,
    x1: (a.x1 - vp.tx) / vp.scale + reach,
    y1: (a.y1 - vp.ty) / vp.scale + reach,
  }));
  const polygons = visiblePolygons(p, wanted);
  paintPolygons(ctx, polygons, p);
  outline(ctx, polygons, p, p.highlight, HIGHLIGHT, 4);
  if (p.selected !== null) outline(ctx, polygons, p, new Set([p.selected]), SELECT, 2.5);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const locked = new Map<string, SceneObject>();
  for (const o of p.scene.objects) if (o.locks !== undefined && o.locks.length > 0) locked.set(o.id, o);
  paintLabels(ctx, p, locked, areas);
  if (areas !== undefined) ctx.restore();
  return { locks: [...locked.keys()] };
}
