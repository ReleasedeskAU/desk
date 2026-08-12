/**
 * Pure helpers for Category B event hooks (no DB).
 */

/**
 * Canonical ordered pair of release codes for conflict uniqueness.
 */
export function orderedReleaseCodes(
  a: string,
  b: string
): [string, string] {
  return a.localeCompare(b) <= 0 ? [a, b] : [b, a];
}

/**
 * True when a drift status label/key is Escalated.
 */
export function isDriftEscalatedStatus(status: string): boolean {
  return /^escalated$/i.test(status.trim());
}
