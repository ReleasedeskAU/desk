"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  buildFilterQueryString,
  hasActiveFilterValues,
  valuesFromSearchParams,
  valuesToSearchParams,
  type FilterSchema,
  type FilterValues,
} from "@/lib/table-filters";
import { readSortFromValues, sortRows, type SortAccessor, type SortDirection } from "@/lib/table-sort";
import { useTableSort } from "@/hooks/useTableSort";

const EMPTY_FILTER_SCHEMA: FilterSchema = [];

export function useTableFilters(schema: FilterSchema) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Guard against undefined/partial HMR bindings — same pattern as useTablePagePreferences.
  const resolvedSchema = Array.isArray(schema) ? schema : EMPTY_FILTER_SCHEMA;

  const values = useMemo(
    () => valuesFromSearchParams(searchParams, resolvedSchema),
    [searchParams, resolvedSchema]
  );

  const hasActive = useMemo(() => hasActiveFilterValues(values), [values]);

  const setFilter = useCallback(
    (key: string, value: string) => {
      const field = resolvedSchema.find((f) => f.key === key);
      if (!field) return;
      const next: FilterValues = { ...values, [key]: value };
      if (key !== "page" && "page" in next) next.page = "";
      const params = valuesToSearchParams(next, resolvedSchema, searchParams);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, resolvedSchema, searchParams, values]
  );

  const setFilters = useCallback(
    (patch: Partial<FilterValues>) => {
      const next: FilterValues = { ...values };
      for (const [k, v] of Object.entries(patch)) {
        next[k] = v ?? "";
      }
      const params = valuesToSearchParams(next, resolvedSchema, searchParams);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, resolvedSchema, searchParams, values]
  );

  const clearAll = useCallback(() => {
    const cleared: FilterValues = {};
    for (const field of resolvedSchema) {
      if (field.key === "sort" || field.key === "sortDir") continue;
      cleared[field.key] = "";
    }
    const params = valuesToSearchParams(cleared, resolvedSchema, searchParams);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, resolvedSchema, searchParams]);

  const apiQuery = useMemo(
    () => buildFilterQueryString(values, resolvedSchema),
    [values, resolvedSchema]
  );

  const apiUrl = useCallback(
    (basePath: string) => `${basePath}${apiQuery}`,
    [apiQuery]
  );

  const setSort = useCallback(
    (sort: string, sortDir: SortDirection) => setFilters({ sort, sortDir }),
    [setFilters]
  );

  return { values, setFilter, setFilters, setSort, clearAll, hasActive, apiQuery, apiUrl };
}

type SortedFetchOptions<T> = {
  defaultSortKey?: string;
  defaultSortDir?: SortDirection;
  sortAccessors?: Record<string, SortAccessor<T>>;
};

/** Fetch a list API whenever URL-driven filters change. */
export function useFilteredFetch<T>(apiPath: string, schema: FilterSchema, options: SortedFetchOptions<T> = {}) {
  const { values, setFilter, setFilters, setSort, clearAll, hasActive, apiQuery, apiUrl } = useTableFilters(schema);
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const { sortKey, sortDir, toggleSort } = useTableSort(
    values,
    setFilter,
    options.defaultSortKey ?? "",
    options.defaultSortDir ?? "asc"
  );

  const refetch = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(apiUrl(apiPath))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Failed to load (${r.status})`))))
      .then((data) => !cancelled && setRows(data))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [apiPath, apiUrl, reloadToken]);

  const sortedRows = useMemo(() => {
    if (!options.sortAccessors) return rows;
    const { sortKey: key, sortDir: dir } = readSortFromValues(
      values,
      options.defaultSortKey ?? "",
      options.defaultSortDir ?? "asc"
    );
    return sortRows(rows, key, dir, options.sortAccessors);
  }, [rows, values, options.defaultSortKey, options.defaultSortDir, options.sortAccessors]);

  return {
    rows: sortedRows,
    loading,
    error,
    values,
    setFilter,
    setFilters,
    setSort,
    clearAll,
    hasActive,
    apiQuery,
    sortKey,
    sortDir,
    toggleSort,
    refetch,
  };
}
