/**
 * Conflict create field-set helpers (RD-135).
 *
 * Create must not collect Cancelled / Closed / Rollback outcome fields.
 * This module detects those keys if they appear; it does not hide extra fields.
 */

/**
 * Keys that mean Cancelled, Closed, or Rollback on a form or schema.
 * Matches create names like cancelledAt / closedAt / rollback, not a Cancel button.
 */
const CONFLICT_OUTCOME_FIELD_KEY =
  /^(cancelledAt|canceledAt|closedAt|rolledBackAt|rollback|cancelled|canceled|closed)$/i;

/**
 * Outcome keys present in a field-name list.
 *
 * @param keys - Form, draft, or schema field names
 * @returns Matching Cancelled / Closed / Rollback keys (empty when none)
 */
export function conflictOutcomeFieldKeys(keys: readonly string[]): string[] {
  return keys.filter((key) => CONFLICT_OUTCOME_FIELD_KEY.test(key.trim()));
}

/** Closing `}` for `{` at `open`, or -1 if unmatched. */
function matchingBraceEnd(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function objectFieldKeys(source: string, open: number, label: string): string[] {
  const end = matchingBraceEnd(source, open);
  if (end < 0) throw new Error(`${label} body was not closed`);
  const keys = [...source.slice(open + 1, end).matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[?:]/gm)].map(
    (item) => item[1]!
  );
  if (keys.length === 0) throw new Error(`${label} has no fields`);
  return keys;
}

/**
 * Field names from `export const name = z.object({ ... })` (or chained `.object({`).
 *
 * @param source - TypeScript file text
 * @param constName - Schema constant identifier
 * @returns Keys in source order
 * @throws If the object body is missing or empty
 */
export function parseZodObjectFieldKeys(source: string, constName: string): string[] {
  const header = new RegExp(
    `(?:export\\s+)?const\\s+${constName}\\s*=\\s*z[\\s\\S]*?\\.object\\(\\s*\\{`
  );
  const match = header.exec(source);
  if (!match || match.index == null) {
    throw new Error(`Zod object ${constName} was not found`);
  }
  const open = source.indexOf("{", match.index + match[0].length - 1);
  return objectFieldKeys(source, open, `Zod object ${constName}`);
}

/**
 * Field names from `type Name = { key: ... }`.
 *
 * @param source - TypeScript file text
 * @param typeName - Exported or local type identifier
 * @returns Keys in source order
 * @throws If the type block is missing or empty
 */
export function parseTypeFieldKeys(source: string, typeName: string): string[] {
  const header = new RegExp(`type\\s+${typeName}\\s*=\\s*\\{`);
  const start = source.search(header);
  if (start < 0) {
    throw new Error(`Type ${typeName} was not found`);
  }
  return objectFieldKeys(source, source.indexOf("{", start), `Type ${typeName}`);
}

/**
 * Quoted `label="…"` / `label={'…'}` values in a React source file.
 *
 * @param source - Component source
 * @returns Label strings in appearance order
 */
export function parseJsxFieldLabels(source: string): string[] {
  const labels: string[] = [];
  const quoted = /label=(?:["']([^"']+)["']|\{["']([^"']+)["']\})/g;
  for (const match of source.matchAll(quoted)) {
    const value = match[1] ?? match[2];
    if (value) labels.push(value);
  }
  return labels;
}

/**
 * Whether a visible label is a Cancelled / Closed / Rollback field caption.
 * Ignores the create-modal Cancel action (not "Cancelled").
 *
 * @param label - UI caption
 * @returns True when the caption is one of the three outcome concepts
 */
export function isConflictOutcomeFieldLabel(label: string): boolean {
  const normalized = label.trim().toLocaleLowerCase();
  return (
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "closed" ||
    normalized === "rollback" ||
    normalized === "cancelled at" ||
    normalized === "canceled at" ||
    normalized === "closed at" ||
    normalized === "rollback at"
  );
}
