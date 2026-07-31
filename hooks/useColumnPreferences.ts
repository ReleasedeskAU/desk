"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchTablePreferences,
  getCachedHiddenColumns,
  getCachedTablePreferences,
  isColumnPrefsCached,
  setCachedTablePreferences,
  subscribeTablePreferences,
} from "@/lib/column-preferences-cache";
import { EMPTY_TABLE_PREFERENCES } from "@/lib/table-preferences";

import type { ColumnDef } from "@/lib/table-column-types";

type Options = {
  /** Column keys that cannot be hidden (anchor + actions). Excluded from picker. */
  lockedKeys?: string[];
  /** Column keys hidden by default until the user enables them in Manage Columns. */
  defaultHiddenColumns?: string[];
};

export type { ColumnDef };

function filterHiddenForPage(saved: string[], hideableKeys: Set<string>) {
  return saved.filter((k) => hideableKeys.has(k));
}

function columnDefaultsAppliedStorageKey(pageKey: string) {
  return `sentinel:column-defaults-applied:${pageKey}`;
}

function hasColumnDefaultsApplied(pageKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(columnDefaultsAppliedStorageKey(pageKey)) === "1";
  } catch {
    return false;
  }
}

function markColumnDefaultsApplied(pageKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(columnDefaultsAppliedStorageKey(pageKey), "1");
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

export function resolveHiddenColumns(
  saved: string[],
  hideableKeys: Set<string>,
  defaultHidden: string[],
  pageKey: string
): { hidden: string[]; didMigrate: boolean } {
  const cleaned = filterHiddenForPage(saved, hideableKeys);
  if (!defaultHidden.length) return { hidden: cleaned, didMigrate: false };

  const defaults = defaultHidden.filter((k) => hideableKeys.has(k));
  if (!defaults.length) return { hidden: cleaned, didMigrate: false };

  if (hasColumnDefaultsApplied(pageKey) || defaultsSomeApplied(cleaned, defaults)) {
    return { hidden: cleaned, didMigrate: false };
  }

  const merged = Array.from(new Set([...cleaned, ...defaults]));
  return { hidden: merged, didMigrate: true };
}

export function useColumnPreferences(pageKey: string, allColumns: ColumnDef[] = [], options: Options = {}) {
  const columns = Array.isArray(allColumns) ? allColumns : [];
  const lockedKeysKey = (options.lockedKeys ?? []).join("\0");
  const defaultHiddenSig = (options.defaultHiddenColumns ?? []).join("\0");
  const lockedSet = useMemo(() => new Set(options.lockedKeys ?? []), [lockedKeysKey]);
  const hideableKeysSig = useMemo(
    () => columns.filter((c) => !lockedSet.has(c.key)).map((c) => c.key).join("\0"),
    [columns, lockedSet],
  );
  const hideableColumns = useMemo(
    () => columns.filter((c) => !lockedSet.has(c.key)),
    [columns, lockedSet],
  );

  const hideableKeys = useMemo(
    () => new Set(hideableKeysSig.split("\0").filter(Boolean)),
    [hideableKeysSig],
  );

  const defaultHidden = useMemo(() => {
    return options.defaultHiddenColumns?.length ? options.defaultHiddenColumns : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultHiddenSig]);

  const defaultHiddenRef = useRef(defaultHidden);
  defaultHiddenRef.current = defaultHidden;

  // Always start unloaded on both server and client so the first paint matches
  // (in-memory cache can be warm on client navigations and would skip the skeleton).
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenRef = useRef(hiddenColumns);
  hiddenRef.current = hiddenColumns;

  const persist = useCallback(
    (nextHidden: string[]) => {
      const cached = getCachedTablePreferences(pageKey) ?? { ...EMPTY_TABLE_PREFERENCES };
      const merged = { ...cached, hiddenColumns: nextHidden };
      setCachedTablePreferences(pageKey, merged);
      fetch("/api/table-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageKey, hiddenColumns: nextHidden }),
      }).catch(() => {});
    },
    [pageKey],
  );

  useEffect(() => {
    let cancelled = false;

    const apply = (saved: string[]) => {
      const { hidden, didMigrate } = resolveHiddenColumns(
        saved,
        hideableKeys,
        defaultHiddenRef.current,
        pageKey
      );
      if (cancelled) return;
      setHiddenColumns((prev) => (sameStringArray(prev, hidden) ? prev : hidden));
      setLoaded(true);
      if (didMigrate) {
        markColumnDefaultsApplied(pageKey);
        persist(hidden);
      } else if (defaultHiddenRef.current.length && defaultsSomeApplied(hidden, defaultHiddenRef.current)) {
        markColumnDefaultsApplied(pageKey);
      }
    };

    if (isColumnPrefsCached(pageKey)) {
      const cached = getCachedTablePreferences(pageKey)?.hiddenColumns ?? getCachedHiddenColumns(pageKey) ?? [];
      apply(cached);
    } else {
      setLoaded(false);
      fetchTablePreferences(pageKey).then((prefs) => {
        if (cancelled) return;
        apply(prefs.hiddenColumns);
      });
    }

    // Voice / external writers update the shared cache — refresh local state.
    const unsubscribe = subscribeTablePreferences((key, prefs) => {
      if (cancelled || key !== pageKey) return;
      apply(prefs.hiddenColumns);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [pageKey, hideableKeys, persist]);

  const scheduleSave = useCallback(
    (nextHidden: string[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(nextHidden), 500);
    },
    [persist],
  );

  const saveNow = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    persist(hiddenRef.current);
  }, [persist]);

  const toggleColumn = useCallback(
    (key: string) => {
      if (lockedSet.has(key)) return;
      markColumnDefaultsApplied(pageKey);
      setHiddenColumns((prev) => {
        const isHidden = prev.includes(key);
        if (isHidden) {
          const next = prev.filter((k) => k !== key);
          scheduleSave(next);
          return next;
        }
        const visibleHideable = hideableColumns.filter((c) => !prev.includes(c.key));
        if (visibleHideable.length <= 1 && visibleHideable[0]?.key === key) {
          return prev;
        }
        const next = [...prev, key];
        scheduleSave(next);
        return next;
      });
    },
    [hideableColumns, lockedSet, pageKey, scheduleSave],
  );

  const visibleColumns = useMemo(
    () => columns.filter((c) => lockedSet.has(c.key) || !hiddenColumns.includes(c.key)),
    [columns, hiddenColumns, lockedSet],
  );

  const isColumnVisible = useCallback(
    (key: string) => lockedSet.has(key) || !hiddenColumns.includes(key),
    [hiddenColumns, lockedSet],
  );

  return {
    visibleColumns,
    hiddenColumns,
    hideableColumns,
    toggleColumn,
    saveNow,
    loaded,
    isColumnVisible,
  };
}

