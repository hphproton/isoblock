/** Frame timing, for the frame-time test of SPEC section 17. Recording is off unless asked for. */
export interface FrameSnapshot {
  /** Canvas redraws since the page opened. */
  readonly draws: number;
  /** How many of those painted only a clipped rectangle. */
  readonly partialDraws: number;
  /** Main-thread time of each recorded frame in ms: input, checks, display list and drawing. */
  readonly work: readonly number[];
  /** Time between the recorded frames in ms, as the browser reports animation frames. */
  readonly interval: readonly number[];
  /** Total ms per named phase of the recorded frames (for example the display list, painting). */
  readonly phases: Readonly<Record<string, number>>;
}

export class FrameStats {
  private draws = 0;
  private partialDraws = 0;
  private recording = false;
  private work: number[] = [];
  private interval: number[] = [];
  private phases: Record<string, number> = {};
  private last: number | null = null;

  countDraw(partial: boolean): void {
    this.draws += 1;
    if (partial) this.partialDraws += 1;
  }

  start(): void {
    this.recording = true;
    this.work = [];
    this.interval = [];
    this.phases = {};
    this.last = null;
  }

  stop(): void {
    this.recording = false;
  }

  /** Run `fn`, and while recording add its duration to the phase `name`. */
  time<T>(name: string, fn: () => T): T {
    if (!this.recording) return fn();
    const start = performance.now();
    try {
      return fn();
    } finally {
      this.phases[name] = (this.phases[name] ?? 0) + performance.now() - start;
    }
  }

  /** Record one frame that drew something. `time` is the animation frame timestamp. */
  frame(time: number, workMs: number): void {
    if (!this.recording) return;
    this.work.push(workMs);
    if (this.last !== null) this.interval.push(time - this.last);
    this.last = time;
  }

  snapshot(): FrameSnapshot {
    return { draws: this.draws, partialDraws: this.partialDraws, work: [...this.work], interval: [...this.interval], phases: { ...this.phases } };
  }
}
