import type { FrameStats } from "./stats";

/** What the frame loop runs for every view, in two steps. */
export interface Frameable {
  /** Apply pointer input that arrived since the last frame (the live part of a drag). */
  step(): void;
  /** Draw if something changed. Returns true when it drew. */
  draw(): boolean;
}

/**
 * One animation frame callback for all views, scheduled only when something changed ("redraw only
 * on change"). All work of a frame happens inside it, so it can be timed as a whole.
 */
export class FrameLoop {
  private views: readonly Frameable[] = [];
  private scheduled = false;
  private running = false;

  constructor(private readonly stats: FrameStats) {}

  setViews(views: readonly Frameable[]): void {
    this.views = views;
  }

  request(): void {
    if (this.scheduled || this.running) return;
    this.scheduled = true;
    requestAnimationFrame((time) => this.frame(time));
  }

  private frame(time: number): void {
    this.scheduled = false;
    this.running = true;
    const start = performance.now();
    let drew = false;
    try {
      for (const view of this.views) view.step();
      for (const view of this.views) drew = view.draw() || drew;
    } finally {
      this.running = false;
    }
    if (drew) this.stats.frame(time, performance.now() - start);
  }
}
