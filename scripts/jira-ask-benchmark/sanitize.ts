/**
 * Strip secrets from objects before they are written to disk.
 */

const BLOCKED_KEY = /^(authorization|token|pat|password|secret|api[_-]?key|ask_test_token|staffless_ai_pat)$/i;

/**
 * Deep-clone JSON and drop secret-like keys. Used only for output files.
 * @param value - Any JSON-serializable value.
 */
export function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (BLOCKED_KEY.test(key)) continue;
      out[key] = stripSecrets(child);
    }
    return out;
  }
  return value;
}

/**
 * Escape one CSV field (RFC 4180 quotes).
 */
export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
