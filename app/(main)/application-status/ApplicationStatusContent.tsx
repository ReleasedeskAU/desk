"use client";

import { useEffect, useMemo, useState } from "react";
import { HeartPulse } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { FilterRangeInputs, FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import {
  APPLICATION_STATUS_COLUMNS,
  APPLICATION_STATUS_DEFAULT_HIDDEN_FILTER_KEYS,
  APPLICATION_STATUS_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { cn, formatDate } from "@/lib/utils";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { APPLICATION_STATUS_SORT_PRESETS } from "@/lib/table-sort-presets";
import { DataTable, DataTableHeadRow, dataTableTableClass, tableCell, tableRow } from "@/components/ui/data-table";
import { useFilteredFetch } from "@/hooks/useTableFilters";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { APPLICATION_STATUS_FILTER_SCHEMA } from "@/lib/table-filters";
import { safeFetchJson } from "@/lib/safe-fetch";

type StatusRow = {
  id: string;
  application: { id: string; name: string; department: { name: string } };
  environmentName: string;
  status: string;
  lastCheck: string;
  uptimePercent: number | null;
  notes: string | null;
};

const STATUS_CLASSES: Record<string, string> = {
  Healthy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  Up: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  Degraded: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  Down: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
};

export default function ApplicationStatusContent() {
  const {
    rows,
    loading,
    values,
    setFilter,
    setSort,
    clearAll,
    hasActive,
    sortKey,
    sortDir,
    toggleSort,
  } = useFilteredFetch<StatusRow>("/api/application-status", APPLICATION_STATUS_FILTER_SCHEMA, {
    defaultSortKey: "application",
    defaultSortDir: "asc",
    sortAccessors: {
      application: (r) => r.application.name,
      department: (r) => r.application.department.name,
      environment: (r) => r.environmentName,
      status: (r) => r.status,
      uptimePercent: (r) => r.uptimePercent ?? -1,
      lastCheck: (r) => new Date(r.lastCheck).getTime(),
      notes: (r) => r.notes ?? "",
    },
  });
  const [apps, setApps] = useState<{ id: string; name: string }[]>([]);
  const [allRows, setAllRows] = useState<StatusRow[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [appsRes, rowsRes] = await Promise.all([
        safeFetchJson<{ id: string; name: string }[]>("/api/applications", { signal: ac.signal, label: "applications" }),
        safeFetchJson<StatusRow[]>("/api/application-status", { signal: ac.signal, label: "application-status" }),
      ]);
      if (ac.signal.aborted) return;
      if (appsRes.ok) setApps(appsRes.data);
      if (rowsRes.ok) setAllRows(rowsRes.data);
    })();
    return () => ac.abort();
  }, []);

  const statuses = useMemo(() => [...new Set(allRows.map((r) => r.status))].sort(), [allRows]);
  const envs = useMemo(() => [...new Set(allRows.map((r) => r.environmentName))].sort(), [allRows]);

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "application-status",
    APPLICATION_STATUS_COLUMNS,
    APPLICATION_STATUS_FILTER_FIELDS,
    {
      lockedKeys: ["application"],
      defaultHiddenFilters: APPLICATION_STATUS_DEFAULT_HIDDEN_FILTER_KEYS,
    }
  );

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  return (
    <div>
      <TopBar
        pageKey="application-status"
        trailing={<PageDocumentation pageKey="application-status" />}
        title="Application Status" subtitle={`${rows.length} application × environment record${rows.length === 1 ? "" : "s"} — current state snapshot`} />
      {!tablePending && (
        <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
          {isFilterVisible("status") && (
            <FilterSelect value={values.status} onChange={(v) => setFilter("status", v)}>
              <option value="">All statuses</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("environmentName") && (
            <FilterSelect value={values.environmentName} onChange={(v) => setFilter("environmentName", v)}>
              <option value="">All environments</option>
              {envs.map((e) => <option key={e} value={e}>{e}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("applicationId") && (
            <FilterSelect value={values.applicationId} onChange={(v) => setFilter("applicationId", v)}>
              <option value="">All applications</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("uptimePercent") && (
            <div className="inline-flex items-center gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Uptime%</span>
              <FilterRangeInputs
                minValue={values.uptimeMin}
                maxValue={values.uptimeMax}
                onMinChange={(v) => setFilter("uptimeMin", v)}
                onMaxChange={(v) => setFilter("uptimeMax", v)}
                minPlaceholder="0"
                maxPlaceholder="100"
              />
            </div>
          )}
          {isFilterVisible("notesQ") && (
            <FilterTextInput
              value={values.notesQ}
              onChange={(v) => setFilter("notesQ", v)}
              placeholder="Notes…"
            />
          )}
          {isFilterVisible("lastCheckQ") && (
            <FilterTextInput
              value={values.lastCheckQ}
              onChange={(v) => setFilter("lastCheckQ", v)}
              placeholder="Last check (YYYY-MM-DD)…"
            />
          )}
        </TableFilterBar>
      )}
      {tablePending ? (
        <TableSkeleton columns={APPLICATION_STATUS_COLUMNS.length} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-12 text-center">
          <HeartPulse className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{hasActive ? "No records match the selected filters." : "No application status data recorded."}</p>
        </div>
      ) : (
        <DataTable title="Application Health" icon={HeartPulse} toolbar={<TablePageToolbar columnPicker={columnPicker} presets={APPLICATION_STATUS_SORT_PRESETS} sortKey={sortKey} sortDir={sortDir} onSelectSort={setSort} />}>
          <div className="overflow-x-auto">
            <table className={dataTableTableClass}>
              <thead>
                <DataTableHeadRow
                  columns={APPLICATION_STATUS_COLUMNS}
                  isColumnVisible={isColumnVisible}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={tableRow}>
                    {isColumnVisible("application") && <td className={`${tableCell} whitespace-nowrap`}>{r.application.name}</td>}
                    {isColumnVisible("department") && <td className={`${tableCell} whitespace-nowrap`}>{r.application.department.name}</td>}
                    {isColumnVisible("environment") && <td className={`${tableCell} whitespace-nowrap`}>{r.environmentName}</td>}
                    {isColumnVisible("status") && (
                    <td className={`${tableCell} whitespace-nowrap`}>
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_CLASSES[r.status] ?? STATUS_CLASSES.Degraded)}>{r.status}</span>
                    </td>
                    )}
                    {isColumnVisible("lastCheck") && <td className={`${tableCell} whitespace-nowrap text-gray-500`}>{formatDate(r.lastCheck)}</td>}
                    {isColumnVisible("uptimePercent") && <td className={`${tableCell} whitespace-nowrap`}>{r.uptimePercent != null ? `${r.uptimePercent}%` : "—"}</td>}
                    {isColumnVisible("notes") && <td className={`${tableCell} truncate max-w-[280px]`} title={r.notes ?? ""}>{r.notes ?? "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataTable>
      )}
    </div>
  );
}
