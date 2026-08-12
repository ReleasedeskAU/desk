/**
 * Pure elapsed-time helpers for Category A automations (testable without waiting).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days elapsed from `from` to `now` (floor). Negative when `from` is in the future.
 * @param from - Anchor timestamp (status entered / decision date / createdAt)
 * @param now - Evaluation clock
 */
export function daysElapsed(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * True when at least `thresholdDays` full days have passed since `from`.
 * @param from - Anchor timestamp
 * @param thresholdDays - Minimum whole days required (must be > 0)
 * @param now - Evaluation clock
 */
export function isPastDayThreshold(
  from: Date,
  thresholdDays: number,
  now: Date
): boolean {
  if (!Number.isFinite(thresholdDays) || thresholdDays <= 0) return false;
  return daysElapsed(from, now) >= thresholdDays;
}

/**
 * UTC calendar day key YYYY-MM-DD for schedule conflict comparison (AV-05).
 * @param value - Date or null
 */
export function utcDayKey(value: Date | null | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Whether two deploy dates fall on the same UTC calendar day.
 */
export function sameUtcDeployDay(
  a: Date | null | undefined,
  b: Date | null | undefined
): boolean {
  const ka = utcDayKey(a);
  const kb = utcDayKey(b);
  return ka != null && kb != null && ka === kb;
}
