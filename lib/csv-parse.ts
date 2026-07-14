import { parse } from "csv-parse/sync";

/** Cap upload size / row count to reduce DoS risk from CSV import. */
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 5_000;

/**
 * Parse CSV text with a real parser (quoted fields, embedded commas, escapes).
 * Returns rows as string[][]; trims cell whitespace. Empty input → [].
 * @throws if the CSV is malformed
 */
export function parseCsvText(text: string): string[][] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const records = parse(trimmed, {
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
    // Preserve empty trailing cells; bom handling for Excel exports
    bom: true,
  }) as string[][];

  return records.map((row) => row.map((cell) => String(cell ?? "").trim()));
}
