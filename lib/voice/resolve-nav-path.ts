/**
 * Resolve a navigate target from entity catalogs / visible context.
 * Prefer real hrefs from search + app context over inventing URL shapes.
 */
import { searchAll } from "@/lib/search";
import { getVoiceAppContext } from "@/lib/voice/app-context";
import { ENTITY_HREF_PREFIX } from "@/lib/search-entity-types";

export type ResolvedEntityNav = {
  path: string;
  label?: string;
};

/**
 * Pull a lookup token from a model-supplied path or bare code.
 * e.g. `/release/REL-0004` → `REL-0004`, `REL-0004` → `REL-0004`.
 * @param raw - navigate_to path arg.
 */
export function extractNavLookupToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const pathname = /^https?:\/\//i.test(trimmed)
      ? new URL(trimmed).pathname
      : trimmed.split(/[?#]/)[0] ?? trimmed;
    const parts = pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? trimmed;
    return decodeURIComponent(last).trim();
  } catch {
    return trimmed;
  }
}

/**
 * Match a token against visible list rows (current page context).
 * @param token - Business code or path segment.
 */
function resolveFromAppContext(token: string): ResolvedEntityNav | null {
  const ctx = getVoiceAppContext();
  if (!ctx?.visible.length || !token) return null;
  const upper = token.toUpperCase();
  const hit = ctx.visible.find(
    (row) =>
      row.code.toUpperCase() === upper ||
      row.path.split("/").pop()?.toUpperCase() === upper ||
      row.label.toUpperCase().startsWith(upper)
  );
  if (!hit?.path.startsWith("/")) return null;
  return { path: hit.path, label: hit.label };
}

/**
 * Match a token against GlobalSearch + seed catalog hrefs.
 * Prefers exact path-segment / label-prefix matches so we never invent URLs.
 * @param token - Business code or id segment.
 */
function resolveFromSearchCatalog(token: string): ResolvedEntityNav | null {
  if (!token) return null;
  const upper = token.toUpperCase();
  const results = searchAll(token);
  const exact = results.find((r) => {
    const seg = r.href.split("/").pop()?.toUpperCase();
    return (
      seg === upper ||
      r.label.toUpperCase().startsWith(`${upper} `) ||
      r.label.toUpperCase().startsWith(`${upper}—`) ||
      r.label.toUpperCase().startsWith(`${upper} -`)
    );
  });
  if (exact?.href.startsWith("/")) {
    return { path: exact.href, label: exact.label };
  }
  return null;
}

/**
 * Build detail path from the shared entity-type → href registry (single source of truth).
 * Only used when type+id are already known from get_summary / search — not for guessing.
 * @param entityType - Canonical search entity type.
 * @param entityId - Business code or id.
 */
export function detailPathForEntity(
  entityType: string,
  entityId: string
): string | null {
  const prefix = ENTITY_HREF_PREFIX[entityType.trim().toLowerCase()];
  const id = entityId.trim();
  if (!prefix || !id) return null;
  return `${prefix}/${id}`;
}

/**
 * Resolve a model navigate hint to a catalog href.
 * Order: visible app context → search/seed catalog.
 * Does not rewrite URL spellings; only returns paths that already exist in data.
 * @param raw - Raw navigate_to path (may be wrong singular, bare code, etc.).
 */
export function resolveEntityNavFromHint(raw: string): ResolvedEntityNav | null {
  const token = extractNavLookupToken(raw);
  if (!token) return null;
  return resolveFromAppContext(token) ?? resolveFromSearchCatalog(token);
}
