/**
 * Interim Scope write confirmation copy. Swap when BA posts different wording.
 */
export const SCOPE_DRAFT_SAVED = "Scope draft saved";

/** Interim copy after a section editor is added. */
export const SCOPE_EDITOR_ADDED = "Editor added";

export type ScopeGrantSnapshot = {
  id: string;
  granteeUserId: string;
  grantedByUserId: string;
};

/**
 * Read the grant list from a scope write JSON body.
 *
 * @param data - Parsed PATCH/POST body (may be null/unknown).
 * @returns Grant rows when `scope.grants` is an array; otherwise null.
 */
export function grantsFromScopeWriteBody(data: unknown): ScopeGrantSnapshot[] | null {
  if (!data || typeof data !== "object") return null;
  const scope = (data as { scope?: unknown }).scope;
  if (!scope || typeof scope !== "object") return null;
  const grants = (scope as { grants?: unknown }).grants;
  if (!Array.isArray(grants)) return null;
  const rows: ScopeGrantSnapshot[] = [];
  for (const row of grants) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    if (
      typeof rec.id !== "string" ||
      typeof rec.granteeUserId !== "string" ||
      typeof rec.grantedByUserId !== "string"
    ) {
      continue;
    }
    rows.push({
      id: rec.id,
      granteeUserId: rec.granteeUserId,
      grantedByUserId: rec.grantedByUserId,
    });
  }
  return rows;
}
