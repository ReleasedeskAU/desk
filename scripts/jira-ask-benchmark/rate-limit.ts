/**
 * Sliding-window limiter and retry backoff helpers.
 * The Ask test route has no volume cap; the runner does not wait between questions.
 */

export const ASK_MAX_REQUESTS = 20;
export const ASK_WINDOW_MS = 5 * 60 * 1000;

export type AcquireResult = { waited_ms: number };

/**
 * Wait until a new hit fits inside a sliding window.
 * @param maxHits - Maximum hits allowed in the window.
 * @param windowMs - Window length in milliseconds.
 * @param now - Clock, injectable for tests.
 * @param sleepFn - Sleep implementation, injectable for tests.
 */
export class SlidingWindowLimiter {
  private readonly hits: number[] = [];

  constructor(
    private readonly maxHits: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
    private readonly sleepFn: (ms: number) => Promise<void> = sleep
  ) {}

  /**
   * Reserve one slot, sleeping if the window is full.
   * @returns How long this call waited before proceeding.
   */
  async acquire(): Promise<AcquireResult> {
    let waited = 0;
    for (;;) {
      const t = this.now();
      while (this.hits.length > 0 && t - (this.hits[0] ?? 0) >= this.windowMs) {
        this.hits.shift();
      }
      if (this.hits.length < this.maxHits) {
        this.hits.push(t);
        return { waited_ms: waited };
      }
      const oldest = this.hits[0] ?? t;
      const waitMs = Math.max(250, oldest + this.windowMs - t + 50);
      await this.sleepFn(waitMs);
      waited += waitMs;
    }
  }
}

/**
 * Promise-based delay. Not used for secrets.
 * @param ms - Milliseconds to wait.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff delay for attempt n (0-based), capped at 16s.
 * @param attempt - Zero-based retry index.
 */
export function backoffMs(attempt: number): number {
  return Math.min(16_000, 1000 * 2 ** attempt);
}
