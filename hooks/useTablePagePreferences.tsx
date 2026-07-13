"use client";

import { useMemo } from "react";
import { ColumnPicker } from "@/components/filters/ColumnPicker";
import { FilterPicker } from "@/components/filters/FilterPicker";
import { useColumnPreferences } from "@/hooks/useColumnPreferences";
import { useFilterPreferences } from "@/hooks/useFilterPreferences";
import type { ColumnDef, FilterFieldDef } from "@/lib/table-column-types";

export function useTablePagePreferences(
  pageKey: string,
  allColumns: ColumnDef[] | undefined,
  filterFields: FilterFieldDef[] | undefined,
  options: { lockedKeys?: string[]; defaultHiddenFilters?: string[]; defaultHiddenColumns?: string[] } = {}
) {
  const columns = Array.isArray(allColumns) ? allColumns : [];
  const filters = Array.isArray(filterFields) ? filterFields : [];
  const columnPrefs = useColumnPreferences(pageKey, columns, {
    lockedKeys: options.lockedKeys,
    defaultHiddenColumns: options.defaultHiddenColumns,
  });
  const filterPrefs = useFilterPreferences(pageKey, filters, {
    defaultHiddenFilters: options.defaultHiddenFilters,
  });

  const columnPicker = useMemo(
    () => (
      <ColumnPicker
        hideableColumns={columnPrefs.hideableColumns}
        hiddenColumns={columnPrefs.hiddenColumns}
        toggleColumn={columnPrefs.toggleColumn}
        saveNow={columnPrefs.saveNow}
        loaded={columnPrefs.loaded}
      />
    ),
    [
      columnPrefs.hideableColumns,
      columnPrefs.hiddenColumns,
      columnPrefs.toggleColumn,
      columnPrefs.saveNow,
      columnPrefs.loaded,
    ]
  );

  const filterPicker = useMemo(
    () => (
      <FilterPicker
        hideableFilters={filterPrefs.hideableFilters}
        hiddenFilters={filterPrefs.hiddenFilters}
        toggleFilter={filterPrefs.toggleFilter}
        saveNow={filterPrefs.saveNow}
        loaded={filterPrefs.loaded}
      />
    ),
    [
      filterPrefs.hideableFilters,
      filterPrefs.hiddenFilters,
      filterPrefs.toggleFilter,
      filterPrefs.saveNow,
      filterPrefs.loaded,
    ]
  );

  const prefsLoaded = columnPrefs.loaded && filterPrefs.loaded;

  return {
    ...columnPrefs,
    ...filterPrefs,
    columnPicker,
    filterPicker,
    prefsLoaded,
  };
}
