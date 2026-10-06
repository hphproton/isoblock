import { buildDisplayList, createDisplayCache, type DisplayItem } from "../core/displayList";
import { dragTo, type DragStart } from "../core/drag";
import { pickObject } from "../core/pick";
import { contentGround, planCamera } from "../core/planView";
import type { Camera, Scene, Vec2 } from "../core/types";
import {
  fitViewport,
  fromCanvas,
  groundBounds,
  panBy,
  toCanvas,
  zoomAt,
  type Viewport,
} from "../core/viewport";
import { dirtyRects, type Painted } from "./dirty";
import { createDrawCache, drawView, type DrawReport } from "./draw";
import type { Frameable } from "./frames";
import type { FrameStats } from "./stats";
import { currentScene, type EditorStore } from "./store";

export type ViewKind = "iso" | "plan";

/** How far from an object (CSS pixels) a pointer still hits it. Fingers get more room. */
const SLOP: Readonly<Record<string, number>> = { touch: 24, pen: 12, mouse: 6 };
/** How far the pointer must travel (CSS pixels) before a press on an object becomes a drag. */
const THRESHOLD: Readonly<Record<string, number>> = { touch: 8, pen: 4, mouse: 3 };
const PLAN_CAMERA: Camera = planCamera();
const FIT_MARGIN = 20;

type Gesture =
  | { readonly kind: "none" }
  | {
      readonly kind: "pan";
      readonly pointerId: number;
      readonly down: Vec2;
      readonly threshold: number;
      moved: boolean;
      x: number;
      y: number;
    }
  | {
      readonly kind: "drag";
      readonly pointerId: number;
      readonly start: DragStart;
      readonly base: Scene;
      readonly camera: Camera;
      readonly down: Vec2;
      readonly threshold: number;
      moved: boolean;
      warned: boolean;
      latest: Vec2 | null;
    }
  | { readonly kind: "pinch"; distance: number; center: Vec2 };

export class SceneView implements Frameable {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cache = createDisplayCache();
  private readonly drawCache = createDrawCache();
  private readonly pointers = new Map<number, Vec2>();
  private viewport: Viewport = { scale: 1, tx: 0, ty: 0 };
  private fitScale = 1;
  private fitted = true;
  private needsFit = true;
  private openedSeen = -1;
  private extent: readonly [number, number, number, number] | undefined;
  private size = { w: 0, h: 0, dpr: 1 };
  private dirty = true;
  private gesture: Gesture = { kind: "none" };
  private items: readonly DisplayItem[] = [];
  private report: DrawReport = { locks: [] };
  private painted: Painted | null = null;
  private fullPaint = true;
  private rect: DOMRect | null = null;
  /** True while a gesture changes the view continuously: the canvas then has a coarser backing store. */
  private interactive = false;

  constructor(
    readonly kind: ViewKind,
    private readonly canvas: HTMLCanvasElement,
    private readonly store: EditorStore,
    private readonly request: () => void,
    private readonly stats: FrameStats,
  ) {
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e, false));
    canvas.addEventListener("pointercancel", (e) => this.up(e, true));
    canvas.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  markDirty(): void {
    this.dirty = true;
    this.request();
  }

  /** Ask for a complete repaint, not a clipped one. */
  markFull(): void {
    this.fullPaint = true;
    this.markDirty();
  }

  private visible(): boolean {
    return this.size.w > 0 && this.size.h > 0;
  }

  private cameraFor(scene: Scene): Camera {
    return this.kind === "iso" ? scene.camera : PLAN_CAMERA;
  }

  private scene(): Scene | null {
    return currentScene(this.store.get());
  }

  /** Fit the view to the scene now, if the canvas has a size. Does not ask for a redraw. */
  private computeFit(scene: Scene): void {
    if (!this.visible()) {
      this.needsFit = true;
      return;
    }
    const ground = contentGround(scene);
    const bounds =
      this.kind === "iso"
        ? { x0: 0, y0: 0, x1: scene.frame.w, y1: scene.frame.h }
        : groundBounds(ground, PLAN_CAMERA);
    this.extent = this.kind === "plan" ? [ground[0] - 8, ground[1] - 8, ground[2] + 8, ground[3] + 8] : undefined;
    this.viewport = fitViewport(bounds, this.size.w, this.size.h, FIT_MARGIN);
    this.fitScale = this.viewport.scale;
    this.fitted = true;
    this.needsFit = false;
  }

  /** Show the whole scene (the "Fit" button). */
  fit(): void {
    const scene = this.scene();
    if (scene !== null) this.computeFit(scene);
    this.markDirty();
  }

  /** Pixel ratio of the backing store: the screen's (at most 2), or 1 while a gesture is moving things. */
  private backingRatio(): number {
    const native = Math.min(window.devicePixelRatio || 1, 2);
    return this.interactive ? Math.min(native, 1) : native;
  }

  /**
   * Give the canvas a backing store for the given CSS size. Painting a canvas costs time in
   * proportion to its pixels, so a dense screen would drop frames during a drag; for the length of a
   * gesture the view is drawn at ratio 1 and made sharp again when the gesture ends.
   */
  private setBacking(w: number, h: number): void {
    const dpr = this.backingRatio();
    if (w === this.size.w && h === this.size.h && dpr === this.size.dpr) return;
    this.size = { w, h, dpr };
    this.fullPaint = true;
    if (w === 0 || h === 0) return;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const scene = this.scene();
    if (scene !== null && (this.fitted || this.needsFit)) this.computeFit(scene);
    this.markDirty();
  }

  private resize(): void {
    this.rect = null;
    const rect = this.canvas.getBoundingClientRect();
    this.setBacking(Math.floor(rect.width), Math.floor(rect.height));
  }

  private setInteractive(on: boolean): void {
    if (this.interactive === on) return;
    this.interactive = on;
    this.setBacking(this.size.w, this.size.h);
  }

  // Frame loop -------------------------------------------------------------------------------

  step(): void {
    const g = this.gesture;
    if (g.kind !== "drag" || g.latest === null) return;
    if (!g.moved) {
      if (Math.hypot(g.latest[0] - g.down[0], g.latest[1] - g.down[1]) < g.threshold) return;
      g.moved = true;
      this.setInteractive(true);
    }
    const point = fromCanvas(this.viewport, g.latest);
    const result = dragTo(g.base, g.camera, g.start, point, this.store.get().snap);
    if (result.blocked.length > 0 && !g.warned) {
      g.warned = true;
      this.store.notify(`${g.start.id} is locked: ${result.blocked.join(", ")}`, "error");
    }
    if (result.scene !== this.scene()) this.stats.time("store", () => this.store.setLive(result.scene));
  }

  draw(): boolean {
    if (!this.dirty || !this.visible()) return false;
    const state = this.store.get();
    const scene = currentScene(state);
    this.dirty = false;
    if (scene === null) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.items = [];
      this.painted = null;
      this.fullPaint = true;
      return false;
    }
    if (this.openedSeen !== state.opened) {
      this.openedSeen = state.opened;
      this.cache.entries = new WeakMap();
      this.needsFit = true;
      this.fullPaint = true;
    }
    if (this.needsFit) this.computeFit(scene);
    const list = this.stats.time("list", () =>
      buildDisplayList(scene, {
        camera: this.cameraFor(scene),
        ...(this.extent === undefined ? {} : { groundExtent: this.extent }),
        anchors: state.overlays.anchors,
        cache: this.cache,
      }),
    );
    const now: Painted = {
      scene,
      viewport: this.viewport,
      overlays: state.overlays,
      selected: state.selected,
      highlight: state.highlightIds,
      width: this.size.w,
      height: this.size.h,
      dpr: this.size.dpr,
      items: list.items,
    };
    const clip = this.fullPaint ? undefined : dirtyRects(this.painted, now);
    this.report = this.stats.time("paint", () => drawView(this.ctx, {
      items: list.items,
      scene,
      viewport: this.viewport,
      width: this.size.w,
      height: this.size.h,
      dpr: this.size.dpr,
      overlays: state.overlays,
      selected: state.selected,
      highlight: state.highlightIds,
      cache: this.drawCache,
      ...(clip === undefined ? {} : { clip }),
    }));
    this.painted = now;
    this.fullPaint = false;
    this.items = list.items;
    this.stats.countDraw(clip !== undefined);
    return true;
  }

  // Pointer input ----------------------------------------------------------------------------

  /** Pointer position in canvas pixels. The canvas rectangle is read once per gesture, not per move: reading it forces layout. */
  private local(e: MouseEvent, fresh = false): Vec2 {
    if (fresh || this.rect === null) this.rect = this.canvas.getBoundingClientRect();
    return [e.clientX - this.rect.left, e.clientY - this.rect.top];
  }

  private down(e: PointerEvent): void {
    const scene = this.scene();
    if (scene === null || (e.pointerType === "mouse" && e.button !== 0)) return;
    const at = this.local(e, true);
    this.pointers.set(e.pointerId, at);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is not active (synthetic events): the gesture still works inside the canvas.
    }
    if (this.pointers.size === 2) return this.beginPinch();
    if (this.pointers.size > 2) return;
    const point = fromCanvas(this.viewport, at);
    const slop = (SLOP[e.pointerType] ?? SLOP.mouse) as number;
    const id = pickObject(this.items, point[0], point[1], slop / this.viewport.scale);
    const object = id === null ? undefined : scene.objects.find((o) => o.id === id);
    this.store.select(object?.id ?? null);
    if (object === undefined) {
      const threshold = (THRESHOLD[e.pointerType] ?? THRESHOLD.mouse) as number;
      this.gesture = { kind: "pan", pointerId: e.pointerId, down: at, threshold, moved: false, x: at[0], y: at[1] };
      return;
    }
    this.gesture = {
      kind: "drag",
      pointerId: e.pointerId,
      start: { id: object.id, pos: object.pos, point },
      base: scene,
      camera: this.cameraFor(scene),
      down: at,
      threshold: (THRESHOLD[e.pointerType] ?? THRESHOLD.mouse) as number,
      moved: false,
      warned: false,
      latest: null,
    };
  }

  private beginPinch(): void {
    if (this.gesture.kind === "drag") this.store.cancelLive();
    const [a, b] = [...this.pointers.values()] as [Vec2, Vec2];
    this.gesture = { kind: "pinch", distance: Math.hypot(a[0] - b[0], a[1] - b[1]), center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  }

  private move(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    const at = this.local(e);
    this.pointers.set(e.pointerId, at);
    const g = this.gesture;
    if (g.kind === "drag" && g.pointerId === e.pointerId) {
      g.latest = at;
      this.request();
    } else if (g.kind === "pan" && g.pointerId === e.pointerId) {
      if (!g.moved && Math.hypot(at[0] - g.down[0], at[1] - g.down[1]) < g.threshold) return;
      g.moved = true;
      this.setInteractive(true);
      this.viewport = panBy(this.viewport, at[0] - g.x, at[1] - g.y);
      g.x = at[0];
      g.y = at[1];
      this.fitted = false;
      this.markDirty();
    } else if (g.kind === "pinch" && this.pointers.size === 2) {
      this.setInteractive(true);
      const [a, b] = [...this.pointers.values()] as [Vec2, Vec2];
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const center: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      // Zoom about the previous centre, then follow the centre: the point between the fingers stays between them.
      if (g.distance > 0 && distance > 0) this.zoom(g.center, distance / g.distance);
      this.viewport = panBy(this.viewport, center[0] - g.center[0], center[1] - g.center[1]);
      g.distance = distance;
      g.center = center;
      this.fitted = false;
      this.markDirty();
    }
  }

  private up(e: PointerEvent, cancelled: boolean): void {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    const g = this.gesture;
    if (g.kind === "drag" && g.pointerId === e.pointerId) {
      if (cancelled) this.store.cancelLive();
      else {
        this.step();
        this.store.commitLive();
      }
      this.gesture = { kind: "none" };
    } else if (g.kind === "pan" && g.pointerId === e.pointerId) {
      this.gesture = { kind: "none" };
    } else if (g.kind === "pinch") {
      this.gesture = { kind: "none" };
    }
    if (this.gesture.kind === "none") this.setInteractive(false);
  }

  private zoom(at: Vec2, factor: number): void {
    this.viewport = zoomAt(this.viewport, at, factor, { min: this.fitScale * 0.25, max: this.fitScale * 40 });
  }

  private wheel(e: WheelEvent): void {
    if (this.scene() === null) return;
    e.preventDefault();
    this.zoom(this.local(e, true), Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    this.fitted = false;
    this.markDirty();
  }

  // Inspection, for tests and tools ----------------------------------------------------------

  /** Page coordinates of a point that picks the object in this view, or null if it is not visible. */
  screenOf(id: string): Vec2 | null {
    const rect = this.canvas.getBoundingClientRect();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i] as DisplayItem;
      if (item.kind !== "polygon" || item.layer !== "object" || item.ref !== id) continue;
      const x = item.points.reduce((s, p) => s + p[0], 0) / item.points.length;
      const y = item.points.reduce((s, p) => s + p[1], 0) / item.points.length;
      if (pickObject(this.items, x, y, 0) !== id) continue;
      const [cx, cy] = toCanvas(this.viewport, [x, y]);
      if (cx < 0 || cy < 0 || cx > this.size.w || cy > this.size.h) return null;
      return [rect.left + cx, rect.top + cy];
    }
    return null;
  }

  getViewport(): Viewport {
    return this.viewport;
  }

  /** Pixel ratio of the canvas backing store right now. */
  pixelRatio(): number {
    return this.size.dpr;
  }

  lockIcons(): readonly string[] {
    return this.report.locks;
  }
}
