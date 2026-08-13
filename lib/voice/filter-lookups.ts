/**
 * Resolve spoken department/application names to DB ids for voice list filters.
 * URL params `dept` / `app` expect ids (same as the UI selects), not display names.
 */
const LOOKUP_CACHE_TTL_MS = 60_000;

type LookupRow = { id: string; name: string };

type LookupCache = {
  at: number;
  departments: LookupRow[];
  applications: LookupRow[];
};

let cache: LookupCache | null = null;

function looksLikeDbId(value: string): boolean {
  // CUID / UUID / cuid2-style ids used in this app — don't re-resolve.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return true;
  }
  if (/^c[a-z0-9]{20,}$/i.test(value)) return true;
  return false;
}

function matchByName(rows: LookupRow[], spoken: string): string | null {
  const q = spoken.trim().toLowerCase();
  if (!q) return null;
  const exact = rows.find((r) => r.name.trim().toLowerCase() === q);
  if (exact) return exact.id;
  const starts = rows.filter((r) => r.name.trim().toLowerCase().startsWith(q));
  if (starts.length === 1) return starts[0]!.id;
  const includes = rows.filter((r) => r.name.trim().toLowerCase().includes(q));
  if (includes.length === 1) return includes[0]!.id;
  return null;
}

/**
 * Load department/application name→id maps (cached briefly).
 * @param deps - Optional fetch for tests.
 */
async function loadFilterLookups(deps?: {
  fetch?: typeof fetch;
}): Promise<LookupCache | null> {
  const now = Date.now();
  if (cache && now - cache.at < LOOKUP_CACHE_TTL_MS) return cache;

  const fetcher = deps?.fetch ?? globalThis.fetch;
  if (typeof fetcher !== "function") return cache;

  try {
    const res = await fetcher("/api/release-lookups?include=directories");
    if (!res.ok) return cache;
    const data = (await res.json()) as {
      departments?: LookupRow[];
      applications?: LookupRow[];
    };
    cache = {
      at: now,
      departments: Array.isArray(data.departments) ? data.departments : [],
      applications: Array.isArray(data.applications) ? data.applications : [],
    };
    return cache;
  } catch {
    return cache;
  }
}

const DEPT_KEYS = new Set([
  "dept",
  "department",
  "departmentId",
  "departmentQ",
]);
const APP_KEYS = new Set([
  "app",
  "application",
  "applicationId",
  "applicationQ",
]);

/**
 * Rewrite spoken dept/app filter values to DB ids when needed.
 * Unknown names are left unchanged (URL still updates; list may show empty).
 * @param filters - Raw filter map from the voice tool.
 * @param deps - Optional fetch for tests / Node.
 * @returns New filter map (same keys) with resolved ids where possible.
 */
export async function resolveSpokenFilterLookups(
  filters: Record<string, unknown>,
  deps?: { fetch?: typeof fetch }
): Promise<Record<string, unknown>> {
  const needsLookup = Object.entries(filters).some(([key, raw]) => {
    if (typeof raw !== "string") return false;
    const v = raw.trim();
    if (!v || looksLikeDbId(v)) return false;
    return DEPT_KEYS.has(key) || APP_KEYS.has(key);
  });
  if (!needsLookup) return filters;

  const lookups = await loadFilterLookups(deps);
  if (!lookups) return filters;

  const out: Record<string, unknown> = { ...filters };
  for (const [key, raw] of Object.entries(filters)) {
    if (typeof raw !== "string") continue;
    const v = raw.trim();
    if (!v || looksLikeDbId(v)) continue;
    if (DEPT_KEYS.has(key)) {
      const id = matchByName(lookups.departments, v);
      if (id) out[key] = id;
    } else if (APP_KEYS.has(key)) {
      const id = matchByName(lookups.applications, v);
      if (id) out[key] = id;
    }
  }
  return out;
}

/** Test helper — clear the in-memory lookup cache. */
export function clearVoiceFilterLookupCache(): void {
  cache = null;
}
