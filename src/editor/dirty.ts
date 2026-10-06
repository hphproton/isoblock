import type { DisplayItem, DisplayLabel } from "../core/displayList";
import { changedObjects } from "../core/incremental";
import type { Scene } from "../core/types";
import type { Bounds, Viewport } from "../core/viewport";
import type { OverlayName } from "./store";

/** What a canvas shows, to tell what must be painted again after a change. */
export interface Painted {
  readonly scene: Scene;
  readonly viewport: Viewport;
  readonly overlays: Readonly<Record<OverlayName, boolean>>;
  readonly selected: string | null;
  readonly highlight: ReadonlySet<string>;
  /** Canvas size in CSS pixels, and the pixel ratio of its backing store. */
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly items: readonly DisplayItem[];
}

/** A change of at most this many objects is painted as clipped rectangles; more is painted in full. */
export const MAX_PARTIAL = 4;
/** Room (CSS pixels) around a moved shape for its selection or highlight outline. */
const OUTLINE_REACH = 6;

/** Display rectangle of a label, wide enough for its text and, for objects, the lock icon above it. */
function labelRect(item: DisplayLabel, scale: number): Bounds {
  const half = (4 * item.text.length + 8) / scale;
  const up = (item.target === "object" ? 32 : 16) / scale;
  return { x0: item.x - half, y0: item.y - up, x1: item.x + half, y1: item.y + 10 / scale };
}

function grown(a: Bounds | null, b: Bounds): Bounds {
  return a === null ? b : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

/** What is drawn for the given objects: the bounds of their shapes, and of their labels. */
interface Footprint {
  readonly shape: Bounds | null;
  readonly labels: Bounds | null;
}

function footprintOf(items: readonly DisplayItem[], ids: ReadonlySet<string>, scale: number, into: Footprint): Footprint {
  let { shape, labels } = into;
  const only = ids.size === 1 ? ([...ids][0] as string) : null;
  for (const item of items) {
    if (item.layer === "frame" || item.layer === "strip" || item.layer === "zone" || item.layer === "lane" || item.layer === "region") continue;
    if (only !== null ? item.ref !== only : !ids.has(item.ref)) continue;
    if (item.kind === "label") labels = grown(labels, labelRect(item, scale));
    else shape = grown(shape, { x0: item.bounds[0], y0: item.bounds[1], x1: item.bounds[2], y1: item.bounds[3] });
  }
  return { shape, labels };
}

/**
 * The parts of the canvas that differ from what it shows, as display rectangles: where the
 * changed objects were and are, and where their labels were and are. Undefined when all of the
 * canvas must be painted: nothing was painted yet, the view, the overlays, the selection or the
 * highlight changed, or too many objects (or shared inputs such as the camera) changed.
 */
export function dirtyRects(last: Painted | null, now: Painted): Bounds[] | undefined {
  if (
    last === null || last.viewport !== now.viewport || last.overlays !== now.overlays || last.selected !== now.selected ||
    last.highlight !== now.highlight || last.width !== now.width || last.height !== now.height || last.dpr !== now.dpr ||
    last.scene.zones !== now.scene.zones
  ) {
    return undefined;
  }
  const changed = changedObjects(last.scene, now.scene);
  if (changed === "all" || changed.size === 0 || changed.size > MAX_PARTIAL) return undefined;
  const { scale } = now.viewport;
  const { shape, labels } = footprintOf(now.items, changed, scale, footprintOf(last.items, changed, scale, { shape: null, labels: null }));
  if (shape === null) return undefined;
  const room = OUTLINE_REACH / scale;
  const rects = [{ x0: shape.x0 - room, y0: shape.y0 - room, x1: shape.x1 + room, y1: shape.y1 + room }];
  return labels === null ? rects : [...rects, labels];
}
