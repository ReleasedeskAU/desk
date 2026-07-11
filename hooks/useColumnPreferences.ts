"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchTablePreferences,
  getCachedHiddenColumns,
  getCachedTablePreferences,
  isColumnPrefsCached,
  setCachedTablePreferences,
} from "@/lib/column-preferences-cache";
import { EMPTY_TABLE_PREFERENCES } from "@/lib/table-preferences";

import type { ColumnDef } from "@/lib/table-column-types";

type Options = {
  /** Column keys that cannot be hidden (anchor + actions). Excluded from picker. */
  lockedKeys?: string[];
};

export type { ColumnDef };

function filterHiddenForPage(saved: string[], hideableKeys: Set<string>) {
  return saved.filter((k) => hideableKeys.has(k));
}

export function useColumnPreferences(pageKey: string, allColumns: ColumnDef[] = [], options: Options = {}) {
  const columns = Array.isArray(allColumns) ? allColumns : [];
  const lockedKeysKey = (options.lockedKeys ?? []).join("\0");
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

  // Always start unloaded on both server and client so the first paint matches
  // (in-memory cache can be warm on client navigations and would skip the skeleton).
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenRef = useRef(hiddenColumns);
  hiddenRef.current = hiddenColumns;

  useEffect(() => {
    let cancelled = false;

    if (isColumnPrefsCached(pageKey)) {
      const cached = getCachedTablePreferences(pageKey)?.hiddenColumns ?? getCachedHiddenColumns(pageKey) ?? [];
      setHiddenColumns(filterHiddenForPage(cached, hideableKeys));
      setLoaded(true);
      return;
    }

    setLoaded(false);
    fetchTablePreferences(pageKey).then((prefs) => {
      if (cancelled) return;
      setHiddenColumns(filterHiddenForPage(prefs.hiddenColumns, hideableKeys));
      setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [pageKey, hideableKeys]);

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
    [hideableColumns, lockedSet, scheduleSave],
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

