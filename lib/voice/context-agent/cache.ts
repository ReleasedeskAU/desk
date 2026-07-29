/**
 * Short TTL cache for identical voice search keys (optimize repeat asks).
 * Cache is in-memory per tab — never a substitute for DB truth on writes.
 */

import type { SearchResult } from "@/lib/dummy-data";

const TTL_MS = 45_000;
const MAX_ENTRIES = 40;

type Entry = { at: number; results: SearchResult[] };

const cache = new Map<string, Entry>();

/**
 * @param key - Stable cache key (query + entityType).
 */
export function getVoiceSearchCache(key: string): SearchResult[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.results.map((r) => ({ ...r }));
}

/**
 * @param key - Stable cache key.
 * @param results - Ranked results to store.
 */
export function setVoiceSearchCache(key: string, results: SearchResult[]): void {
  cache.set(key, { at: Date.now(), results: results.map((r) => ({ ...r })) });
  if (cache.size > MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

/** Test helper — wipe cache. */
export function clearVoiceSearchCache(): void {
  cache.clear();
}

/**
 * Build a cache key for retrieve.
 */
export function voiceSearchCacheKey(
  primary: string,
  entityType?: string,
  variants: string[] = []
): string {
  return `${primary.toLowerCase()}|${entityType ?? ""}|${variants.join(",")}`;
}
