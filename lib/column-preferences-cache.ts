import { EMPTY_TABLE_PREFERENCES, type TablePreferences } from "@/lib/table-preferences";

const cache = new Map<string, TablePreferences>();
const inflight = new Map<string, Promise<TablePreferences>>();

type PrefsListener = (pageKey: string, prefs: TablePreferences) => void;
const listeners = new Set<PrefsListener>();

/**
 * Subscribe to table preference cache updates (Manage Columns / Manage Filters).
 * Used so voice-driven PUT updates refresh mounted list pages without a full reload.
 * @param listener - Called with pageKey + latest prefs.
 * @returns Unsubscribe.
 */
export function subscribeTablePreferences(listener: PrefsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyPrefs(pageKey: string, prefs: TablePreferences): void {
  for (const listener of listeners) {
    try {
      listener(pageKey, prefs);
    } catch {
      /* subscriber errors must not break preference writes */
    }
  }
}

export function getCachedTablePreferences(pageKey: string): TablePreferences | null {
  return cache.get(pageKey) ?? null;
}

/** @deprecated use getCachedTablePreferences */
export function getCachedHiddenColumns(pageKey: string): string[] | null {
  return cache.get(pageKey)?.hiddenColumns ?? null;
}

export function isColumnPrefsCached(pageKey: string): boolean {
  return cache.has(pageKey);
}

export function setCachedTablePreferences(pageKey: string, prefs: TablePreferences) {
  cache.set(pageKey, prefs);
  inflight.delete(pageKey);
  notifyPrefs(pageKey, prefs);
}

/** @deprecated use setCachedTablePreferences */
export function setCachedHiddenColumns(pageKey: string, hiddenColumns: string[]) {
  const existing = cache.get(pageKey) ?? { ...EMPTY_TABLE_PREFERENCES };
  setCachedTablePreferences(pageKey, { ...existing, hiddenColumns });
}

export function fetchTablePreferences(pageKey: string): Promise<TablePreferences> {
  const cached = cache.get(pageKey);
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(pageKey);
  if (existing) return existing;

  const promise = fetch(`/api/table-preferences?pageKey=${encodeURIComponent(pageKey)}`)
    .then((res) => (res.ok ? res.json() : EMPTY_TABLE_PREFERENCES))
    .then((data: Partial<TablePreferences>) => {
      const prefs: TablePreferences = {
        hiddenColumns: data.hiddenColumns ?? [],
        hiddenFilters: data.hiddenFilters ?? [],
      };
      cache.set(pageKey, prefs);
      inflight.delete(pageKey);
      notifyPrefs(pageKey, prefs);
      return prefs;
    })
    .catch(() => {
      inflight.delete(pageKey);
      return { ...EMPTY_TABLE_PREFERENCES };
    });

  inflight.set(pageKey, promise);
  return promise;
}

/** @deprecated use fetchTablePreferences */
export function fetchColumnPreferences(pageKey: string): Promise<string[]> {
  return fetchTablePreferences(pageKey).then((p) => p.hiddenColumns);
}

export function prefetchColumnPreferences(pageKeys: readonly string[]) {
  for (const key of pageKeys) {
    void fetchTablePreferences(key);
  }
}
