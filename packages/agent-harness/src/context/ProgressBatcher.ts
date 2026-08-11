export const PROGRESS_BATCH_INTERVAL_MS = 250;
export const PROGRESS_BATCH_CHARS = 2048;

export interface ProgressBatcherOptions<T> {
  intervalMs: number;
  chars: number;
  count: (payload: T) => number;
  onFlush: (payloads: T[], now: number) => void;
}

export class ProgressBatcher<T> {
  private pending: T[] = [];
  private pendingChars = 0;
  private lastFlushedAt: number | null = null;

  constructor(private readonly options: ProgressBatcherOptions<T>) {}

  append(payload: T, now = Date.now()): void {
    this.pending.push(payload);
    this.pendingChars += this.options.count(payload);
    if (this.lastFlushedAt === null) {
      this.lastFlushedAt = now;
    }
    this.flushIfNeeded(now);
  }

  flushIfNeeded(now = Date.now()): void {
    if (this.lastFlushedAt === null) return;
    if (this.pendingChars >= this.options.chars || now - this.lastFlushedAt >= this.options.intervalMs) {
      this.flush(now);
    }
  }

  flush(now = Date.now()): void {
    if (this.pending.length === 0) return;
    const payloads = this.pending;
    this.pending = [];
    this.pendingChars = 0;
    this.lastFlushedAt = now;
    this.options.onFlush(payloads, now);
  }
}
