export interface FixedStepLoopOptions<TSnapshot> {
  stepMs: number;
  maxAccumulatedMs?: number;
  update: (deltaMs: number) => TSnapshot;
  render?: (snapshot: TSnapshot, interpolation: number) => void;
}

export class FixedStepLoop<TSnapshot> {
  private frameId = 0;
  private running = false;
  private lastFrameAt = 0;
  private accumulatedMs = 0;
  private latestSnapshot: TSnapshot | null = null;
  private readonly stepMs: number;
  private readonly maxAccumulatedMs: number;
  private readonly update: (deltaMs: number) => TSnapshot;
  private readonly render?: (snapshot: TSnapshot, interpolation: number) => void;

  constructor(options: FixedStepLoopOptions<TSnapshot>) {
    this.stepMs = options.stepMs;
    this.maxAccumulatedMs = options.maxAccumulatedMs ?? options.stepMs * 5;
    this.update = options.update;
    this.render = options.render;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameAt = performance.now();
    this.frameId = window.requestAnimationFrame((timestamp) => this.tick(timestamp));
  }

  stop(): void {
    this.running = false;
    window.cancelAnimationFrame(this.frameId);
  }

  private tick(timestamp: number): void {
    if (!this.running) return;

    const elapsedMs = Math.min(timestamp - this.lastFrameAt, this.maxAccumulatedMs);
    this.lastFrameAt = timestamp;
    this.accumulatedMs += elapsedMs;

    while (this.accumulatedMs >= this.stepMs) {
      this.latestSnapshot = this.update(this.stepMs);
      this.accumulatedMs -= this.stepMs;
    }

    if (this.latestSnapshot) {
      this.render?.(this.latestSnapshot, this.accumulatedMs / this.stepMs);
    }

    this.frameId = window.requestAnimationFrame((nextTimestamp) => this.tick(nextTimestamp));
  }
}
