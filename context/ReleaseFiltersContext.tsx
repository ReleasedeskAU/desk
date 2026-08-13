"use client";

import { useAuth } from "@clerk/nextjs";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  EMPTY_RELEASE_FILTERS,
  filtersFromSearchParams,
  filtersToSearchParams,
  hasActiveFilters,
  type BookingFilterRow,
  type DbReleaseFilterRow,
  type EnvFilterRow,
  type ReleaseListFilters,
} from "@/lib/release-filters";
import type { SortDirection } from "@/lib/table-sort";
import { lookupIncludeQueryForPath } from "@/lib/release-lookup-scope";

type ReleaseFiltersContextValue = {
  filters: ReleaseListFilters;
  hasRefinement: boolean;
  loading: boolean;
  departments: { id: string; name: string }[];
  applications: { id: string; name: string; departmentId: string }[];
  environments: EnvFilterRow[];
  envOptions: EnvFilterRow[];
  bookings: BookingFilterRow[];
  dbRows: DbReleaseFilterRow[];
  calendarEvents: any[];
  setDepartmentId: (id: string) => void;
  setApplicationId: (id: string) => void;
  setEnvironmentId: (id: string) => void;
  setStatus: (status: string) => void;
  setPriority: (priority: string) => void;
  setImpact: (impact: string) => void;
  setFilter: <K extends keyof ReleaseListFilters>(key: K, value: ReleaseListFilters[K]) => void;
  setSort: (sort: string, sortDir?: string) => void;
  toggleSort: (key: string, dir?: SortDirection) => void;
  setPeriod: (period: string) => void;
  setAnchor: (anchor: string) => void;
  setTab: (tab: string) => void;
  clearFilters: () => void;
  filterQuery: string;
  refreshLookups: () => void;
};

const ReleaseFiltersContext = createContext<ReleaseFiltersContextValue | null>(null);

function filtersFromParams(sp: URLSearchParams): ReleaseListFilters {
  return filtersFromSearchParams(sp);
}

export function ReleaseFiltersProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();

  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);

  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [applications, setApplications] = useState<{ id: string; name: string; departmentId: string }[]>([]);
  const [environments, setEnvironments] = useState<EnvFilterRow[]>([]);
  const [bookings, setBookings] = useState<BookingFilterRow[]>([]);
  const [dbRows, setDbRows] = useState<DbReleaseFilterRow[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const includeQuery = lookupIncludeQueryForPath(pathname);
  const [loading, setLoading] = useState(() => includeQuery != null);

  const refreshLookups = useCallback((signal?: AbortSignal) => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    if (!includeQuery) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = filtersToSearchParams(filters);
    params.set("include", includeQuery);
    const url = `/api/release-lookups?${params.toString()}`;

    const load = async (attempt = 0): Promise<void> => {
      if (signal?.aborted) return;
      try {
        const res = await fetch(url, { signal });
        // Clerk client can report signed-in before the session cookie is usable on the API.
        if (res.status === 401 && attempt < 4) {
          const delay = 400 * 2 ** attempt;
          await new Promise((r) => setTimeout(r, delay));
          return load(attempt + 1);
        }
        if (res.status === 401) {
          // Still unauthenticated after retries — stay quiet; page will redirect or re-auth.
          return;
        }
        // 503 = Neon cold-start / transient; retry a few times before giving up.
        if ((res.status === 503 || res.status === 500) && attempt < 5) {
          const delay = 1200 * 2 ** attempt;
          console.warn(`ReleaseFilters: ${url} → ${res.status}, retry ${attempt + 1}/5 in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          return load(attempt + 1);
        }
        if (!res.ok) {
          console.error(`ReleaseFilters: ${url} failed with ${res.status}`);
          return;
        }
        const text = await res.text();
        if (!text || signal?.aborted) return;
        let data: {
          departments?: { id: string; name: string }[];
          applications?: { id: string; name: string; departmentId: string }[];
          environments?: EnvFilterRow[];
          bookings?: BookingFilterRow[];
          releases?: DbReleaseFilterRow[];
          calendarEvents?: unknown[];
        };
        try {
          data = JSON.parse(text);
        } catch {
          console.error(`ReleaseFilters: ${url} returned invalid JSON`);
          return;
        }
        if (signal?.aborted) return;
        setDepartments(data.departments ?? []);
        setApplications(data.applications ?? []);
        setEnvironments(data.environments ?? []);
        setBookings(data.bookings ?? []);
        setDbRows(data.releases ?? []);
        setCalendarEvents(data.calendarEvents ?? []);
      } catch (err: unknown) {
        if (signal?.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (attempt < 3) {
          const delay = 1000 * 2 ** attempt;
          console.warn(`ReleaseFilters: fetch error, retry ${attempt + 1}/3 in ${delay}ms`, err);
          await new Promise((r) => setTimeout(r, delay));
          return load(attempt + 1);
        }
        console.warn("ReleaseFilters: lookup fetch failed", err);
      }
    };

    load().finally(() => {
      if (!signal?.aborted) setLoading(false);
    });
  }, [filters, includeQuery, isLoaded, isSignedIn]);

  useEffect(() => {
    const ac = new AbortController();
    refreshLookups(ac.signal);
    return () => ac.abort();
  }, [refreshLookups]);

  const pushFilters = useCallback(
    (next: ReleaseListFilters) => {
      const params = filtersToSearchParams(next, new URLSearchParams(searchParams.toString()));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const setFilter = useCallback(
    <K extends keyof ReleaseListFilters>(key: K, value: ReleaseListFilters[K]) => {
      pushFilters({ ...filters, [key]: value });
    },
    [filters, pushFilters]
  );

  const setDepartmentId = useCallback(
    (departmentId: string) => pushFilters({ ...filters, departmentId }),
    [filters, pushFilters]
  );

  const setApplicationId = useCallback(
    (applicationId: string) =>
      pushFilters({ ...filters, applicationId, environmentId: "" }),
    [filters, pushFilters]
  );

  const setEnvironmentId = useCallback(
    (environmentId: string) => pushFilters({ ...filters, environmentId }),
    [filters, pushFilters]
  );

  const setStatus = useCallback(
    (status: string) => pushFilters({ ...filters, status }),
    [filters, pushFilters]
  );

  const setPriority = useCallback(
    (priority: string) => pushFilters({ ...filters, priority }),
    [filters, pushFilters]
  );

  const setImpact = useCallback(
    (impact: string) => pushFilters({ ...filters, impact }),
    [filters, pushFilters]
  );

  const setSort = useCallback(
    (sort: string, sortDir?: string) =>
      pushFilters({ ...filters, sort, sortDir: sortDir ?? filters.sortDir }),
    [filters, pushFilters]
  );

  const toggleSort = useCallback(
    (key: string, dir?: SortDirection) => {
      if (!key) return;
      if (dir) {
        pushFilters({ ...filters, sort: key, sortDir: dir });
        return;
      }
      if (filters.sort === key) {
        pushFilters({ ...filters, sortDir: filters.sortDir === "asc" ? "desc" : "asc" });
        return;
      }
      pushFilters({ ...filters, sort: key, sortDir: "asc" });
    },
    [filters, pushFilters]
  );

  const setPeriod = useCallback(
    (period: string) => pushFilters({ ...filters, period }),
    [filters, pushFilters]
  );

  const setAnchor = useCallback(
    (anchor: string) => pushFilters({ ...filters, anchor }),
    [filters, pushFilters]
  );

  const setTab = useCallback(
    (tab: string) => pushFilters({ ...filters, tab }),
    [filters, pushFilters]
  );

  const clearFilters = useCallback(() => {
    // Preserve sort/period/tab chrome when clearing list filters
    pushFilters({
      ...EMPTY_RELEASE_FILTERS,
      sort: filters.sort,
      sortDir: filters.sortDir,
      period: filters.period,
      anchor: filters.anchor,
      tab: filters.tab,
    });
  }, [pushFilters, filters.sort, filters.sortDir, filters.period, filters.anchor, filters.tab]);

  const envOptions = useMemo(() => {
    if (!filters.applicationId) return environments;
    return environments.filter((e) => e.applicationId === filters.applicationId);
  }, [environments, filters.applicationId]);

  const filterQuery = useMemo(() => {
    const p = filtersToSearchParams(filters);
    const s = p.toString();
    return s ? `&${s}` : "";
  }, [filters]);

  const value = useMemo<ReleaseFiltersContextValue>(
    () => ({
      filters,
      hasRefinement: hasActiveFilters(filters),
      loading,
      departments,
      applications,
      environments,
      envOptions,
      bookings,
      dbRows,
      calendarEvents,
      setDepartmentId,
      setApplicationId,
      setEnvironmentId,
      setStatus,
      setPriority,
      setImpact,
      setFilter,
      setSort,
      toggleSort,
      setPeriod,
      setAnchor,
      setTab,
      clearFilters,
      filterQuery,
      refreshLookups,
    }),
    [
      filters,
      loading,
      departments,
      applications,
      environments,
      envOptions,
      bookings,
      dbRows,
      calendarEvents,
      setDepartmentId,
      setApplicationId,
      setEnvironmentId,
      setStatus,
      setPriority,
      setImpact,
      setFilter,
      setSort,
      toggleSort,
      setPeriod,
      setAnchor,
      setTab,
      clearFilters,
      filterQuery,
      refreshLookups,
    ]
  );

  return (
    <ReleaseFiltersContext.Provider value={value}>{children}</ReleaseFiltersContext.Provider>
  );
}

export function useReleaseFilters() {
  const ctx = useContext(ReleaseFiltersContext);
  if (!ctx) throw new Error("useReleaseFilters must be used within ReleaseFiltersProvider");
  return ctx;
}
