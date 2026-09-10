/**
 * BA Scope copy — labels, i-hover help, and write confirmations.
 * Help belongs on the i only; do not render these as body paragraphs.
 */
export const SCOPE_SECTION_HELP =
  "Write what is in and out of this release. Only the Release Manager or owner can edit and approve. After approval, changes need a change request.";

export const SCOPE_APPROVE_BY_LABEL = "Approve by";

export const SCOPE_APPROVE_BY_HELP =
  "Optional. The date this scope should be approved by. Not the release end date, and not CAB.";

export const SCOPE_SECTION_EDITORS_HELP =
  "While this is still a draft, the Release Manager or owner can let someone else edit this section only. They cannot approve.";

export const SCOPE_DRAFT_SAVED = "Scope draft saved";
export const SCOPE_EDITOR_ADDED = "Editor added";
export const SCOPE_EDITOR_REMOVED = "Editor removed";
export const SCOPE_APPROVED = "Scope approved";
export const SCOPE_CHANGE_REQUEST_SAVED = "Change request saved";
export const SCOPE_CHANGE_REQUEST_APPROVED = "Change request approved";

export type ScopeGrantSnapshot = {
  id: string;
  granteeUserId: string;
  grantedByUserId: string;
};

function readGrantRows(grants: unknown): ScopeGrantSnapshot[] | null {
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

function scopeObject(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const scope = (data as { scope?: unknown }).scope;
  if (!scope || typeof scope !== "object") return null;
  return scope as Record<string, unknown>;
}

/**
 * Read the grant list from a scope write JSON body.
 *
 * @param data - Parsed PATCH/POST/DELETE body (may be null/unknown).
 * @param requestId - When set, read that change request’s grants instead of scope grants.
 * @returns Grant rows, or null when the payload has no grant array.
 */
export function grantsFromScopeWriteBody(
  data: unknown,
  requestId?: string
): ScopeGrantSnapshot[] | null {
  const scope = scopeObject(data);
  if (!scope) return null;
  if (!requestId) return readGrantRows(scope.grants);
  const changeRequests = scope.changeRequests;
  if (!Array.isArray(changeRequests)) return null;
  const match = changeRequests.find(
    (row) => row && typeof row === "object" && (row as { id?: unknown }).id === requestId
  );
  if (!match || typeof match !== "object") return null;
  return readGrantRows((match as { grants?: unknown }).grants);
}
