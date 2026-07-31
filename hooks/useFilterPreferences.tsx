"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterPicker } from "@/components/filters/FilterPicker";
import {
  fetchTablePreferences,
  getCachedTablePreferences,
  isColumnPrefsCached,
  setCachedTablePreferences,
  subscribeTablePreferences,
} from "@/lib/column-preferences-cache";
import { EMPTY_TABLE_PREFERENCES } from "@/lib/table-preferences";

import type { FilterFieldDef } from "@/lib/table-column-types";

export type { FilterFieldDef };

/** Stable empty array — never allocate `?? []` inside render (causes effect loops). */
const EMPTY_FILTERS: FilterFieldDef[] = [];
const EMPTY_HIDDEN: string[] = [];

function filterHiddenForPage(saved: string[], allowed: Set<string>) {
  return saved.filter((k) => allowed.has(k));
}

function defaultsAppliedStorageKey(pageKey: string) {
  return `sentinel:filter-defaults-applied:${pageKey}`;
}

function hasDefaultsApplied(pageKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(defaultsAppliedStorageKey(pageKey)) === "1";
  } catch {
    return false;
  }
}

function markDefaultsApplied(pageKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(defaultsAppliedStorageKey(pageKey), "1");
  } catch {
    /* ignore quota / private mode */
  }
}

function defaultsSomeApplied(hidden: string[], defaultHidden: string[]) {
  return defaultHidden.some((k) => hidden.includes(k));
}

function sameStringArray(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Merge page-level default-hidden filters for users who haven't customized yet.
 * Used when new filters are added (e.g. Releases) so existing users keep a
 * minimal bar until they opt in via Manage Filters.
 */
export function resolveHiddenFilters(
  saved: string[],
  allowedKeys: Set<string>,
  defaultHidden: string[],
  pageKey: string
): { hidden: string[]; didMigrate: boolean } {
  const cleaned = filterHiddenForPage(saved, allowedKeys);
  if (!defaultHidden.length) return { hidden: cleaned, didMigrate: false };

  const defaults = defaultHidden.filter((k) => allowedKeys.has(k));
  if (!defaults.length) return { hidden: cleaned, didMigrate: false };

  // Already migrated (local flag) or saved prefs already include a default-hidden key
  if (hasDefaultsApplied(pageKey) || defaultsSomeApplied(cleaned, defaults)) {
    return { hidden: cleaned, didMigrate: false };
  }

  const merged = Array.from(new Set([...cleaned, ...defaults]));
  return { hidden: merged, didMigrate: true };
}

export function useFilterPreferences(
  pageKey: string,
  allFilters: FilterFieldDef[] = EMPTY_FILTERS,
  options: { defaultHiddenFilters?: string[] } = {}
) {
  // Stabilize by content signature so inline `?? []` / new array literals
  // from parents cannot retrigger the load effect every render.
  const filterSig = (Array.isArray(allFilters) ? allFilters : EMPTY_FILTERS)
    .map((f) => f.key)
    .join("\0");
  const defaultHiddenSig = (options.defaultHiddenFilters ?? EMPTY_HIDDEN).join("\0");

  const filters = useMemo(() => {
    const list = Array.isArray(allFilters) ? allFilters : EMPTY_FILTERS;
    return list;
    // filterSig captures identity of the field set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSig]);

  const defaultHidden = useMemo(() => {
    return options.defaultHiddenFilters?.length
      ? options.defaultHiddenFilters
      : EMPTY_HIDDEN;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultHiddenSig]);

  const allowedKeys = useMemo(() => new Set(filters.map((f) => f.key)), [filters]);

  // SSR-safe defaults — cache / localStorage are applied in the effect below.
  const [hiddenFilters, setHiddenFilters] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenRef = useRef(hiddenFilters);
  hiddenRef.current = hiddenFilters;

  // Keep latest allowed/default values in refs so the load effect only
  // depends on pageKey (avoids loops from Set/array identity churn).
  const allowedKeysRef = useRef(allowedKeys);
  allowedKeysRef.current = allowedKeys;
  const defaultHiddenRef = useRef(defaultHidden);
  defaultHiddenRef.current = defaultHidden;

  const persist = useCallback(
    (nextHidden: string[]) => {
      const cached = getCachedTablePreferences(pageKey) ?? { ...EMPTY_TABLE_PREFERENCES };
      const merged = { ...cached, hiddenFilters: nextHidden };
      setCachedTablePreferences(pageKey, merged);
      fetch("/api/table-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageKey, hiddenFilters: nextHidden }),
      }).catch(() => {
        /* prefs are best-effort — UI already updated optimistically */
      });
    },
    [pageKey]
  );

  useEffect(() => {
    let cancelled = false;

    const apply = (saved: string[]) => {
      const { hidden, didMigrate } = resolveHiddenFilters(
        saved,
        allowedKeysRef.current,
        defaultHiddenRef.current,
        pageKey
      );
      if (cancelled) return;

      // Skip setState when nothing changed — prevents update-depth loops.
      setHiddenFilters((prev) => (sameStringArray(prev, hidden) ? prev : hidden));
      setLoaded(true);

      if (didMigrate) {
        markDefaultsApplied(pageKey);
        persist(hidden);
      } else if (
        defaultHiddenRef.current.length &&
        defaultsSomeApplied(hidden, defaultHiddenRef.current)
      ) {
        markDefaultsApplied(pageKey);
      }
    };

    if (isColumnPrefsCached(pageKey)) {
      const cached = getCachedTablePreferences(pageKey)?.hiddenFilters ?? [];
      apply(cached);
    } else {
      setLoaded(false);
      fetchTablePreferences(pageKey).then((prefs) => {
        if (cancelled) return;
        apply(prefs.hiddenFilters);
      });
    }

    const unsubscribe = subscribeTablePreferences((key, prefs) => {
      if (cancelled || key !== pageKey) return;
      apply(prefs.hiddenFilters);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // Only re-load when the page changes. Field-set / default-hidden updates
    // are read via refs inside apply().
  }, [pageKey, persist]);

  const scheduleSave = useCallback(
    (nextHidden: string[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(nextHidden), 500);
    },
    [persist]
  );

  const saveNow = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    persist(hiddenRef.current);
  }, [persist]);

  const toggleFilter = useCallback(
    (key: string) => {
      markDefaultsApplied(pageKey);
      setHiddenFilters((prev) => {
        const isHidden = prev.includes(key);
        const next = isHidden ? prev.filter((k) => k !== key) : [...prev, key];
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave, pageKey]
  );

  /**
   * A filter is visible only if this page registered it AND the user hasn't hidden it.
   * Keys not in the page's field list must never render — prevents Releases-only
   * filters from bleeding onto Calendar/Inbox when they share ReleaseFiltersBar.
   */
  const isFilterVisible = useCallback(
    (key: string) => allowedKeys.has(key) && !hiddenFilters.includes(key),
    [allowedKeys, hiddenFilters]
  );

  const hideableFilters = filters;

  const filterPicker = useMemo(
    () => (
      <FilterPicker
        hideableFilters={hideableFilters}
        hiddenFilters={hiddenFilters}
        toggleFilter={toggleFilter}
        saveNow={saveNow}
        loaded={loaded}
      />
    ),
    [hideableFilters, hiddenFilters, toggleFilter, saveNow, loaded]
  );

  return {
    hiddenFilters,
    hideableFilters,
    toggleFilter,
    isFilterVisible,
    saveNow,
    loaded,
    filterPicker,
  };
}
