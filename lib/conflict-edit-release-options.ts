/**
 * Conflict edit Release select options — same /api/releases list as create.
 * Keeps the currently linked code visible even when it is absent from that list.
 */

export const CONFLICT_EDIT_RELEASE_EMPTY_LABEL = "No releases available";

export type ConflictEditRelease = {
  releaseCode: string;
  name?: string | null;
};

export type ConflictEditReleaseOption = { value: string; label: string };

function optionLabel(code: string, name?: string | null): string {
  const trimmed = name?.trim() ?? "";
  return trimmed ? `${code} — ${trimmed}` : code;
}

/**
 * Build Release 1 / Release 2 select options for Conflict edit.
 * Uses the create lookup list (releaseCode + name). Always includes
 * `currentCode` so a linked release still displays if filtered out.
 * An empty lookup does not throw — it returns one empty-state option.
 *
 * @param input.releases - Rows from GET /api/releases (or [] on failure)
 * @param input.currentCode - Currently linked release code on this field
 * @param input.currentName - Display name for the current code when not in the list
 * @param input.excludeCodes - Other-side codes to omit (current is never omitted)
 * @returns Select options; never an empty array
 */
export function conflictEditReleaseOptions(input: {
  releases: readonly ConflictEditRelease[] | null | undefined;
  currentCode?: string | null;
  currentName?: string | null;
  excludeCodes?: readonly string[] | null;
}): ConflictEditReleaseOption[] {
  const current = input.currentCode?.trim() ?? "";
  const excluded = new Set(
    (input.excludeCodes ?? [])
      .map((code) => code.trim())
      .filter((code) => code && code !== current)
  );
  const seen = new Set<string>();
  const opts: ConflictEditReleaseOption[] = [];
  for (const row of input.releases ?? []) {
    const code = row.releaseCode?.trim() ?? "";
    if (!code || excluded.has(code) || seen.has(code)) continue;
    seen.add(code);
    opts.push({ value: code, label: optionLabel(code, row.name) });
  }
  opts.sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
  if (current && !seen.has(current)) {
    opts.unshift({ value: current, label: optionLabel(current, input.currentName) });
  }
  if (opts.length === 0) {
    return [{ value: "", label: CONFLICT_EDIT_RELEASE_EMPTY_LABEL }];
  }
  return opts;
}
