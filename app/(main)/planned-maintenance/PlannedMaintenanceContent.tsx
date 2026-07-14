"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import {
  PLANNED_MAINTENANCE_COLUMNS,
  PLANNED_MAINTENANCE_DEFAULT_HIDDEN_COLUMN_KEYS,
  PLANNED_MAINTENANCE_DEFAULT_HIDDEN_FILTER_KEYS,
  PLANNED_MAINTENANCE_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { formatDate } from "@/lib/utils";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { MAINTENANCE_SORT_PRESETS } from "@/lib/table-sort-presets";
import { DataTable, DataTableHeadRow, dataTableTableClass, tableCell, tableRow } from "@/components/ui/data-table";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useFilteredFetch } from "@/hooks/useTableFilters";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { safeFetchJson } from "@/lib/safe-fetch";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { PLANNED_MAINTENANCE_FILTER_SCHEMA } from "@/lib/table-filters";

type MaintenanceRow = {
  id: string;
  maintenanceCode: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  type: string;
  application: { id: string; name: string } | null;
  environmentName: string;
  departmentName: string | null;
  impact: string;
  requestor: string | null;
  approvalStatus: string;
  notes: string | null;
};

export default function PlannedMaintenanceContent() {
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
  } = useFilteredFetch<MaintenanceRow>("/api/planned-maintenance", PLANNED_MAINTENANCE_FILTER_SCHEMA, {
    defaultSortKey: "scheduledDate",
    defaultSortDir: "asc",
    sortAccessors: {
      maintenanceCode: (r) => r.maintenanceCode,
      scheduledDate: (r) => new Date(r.scheduledDate).getTime(),
      startTime: (r) => r.startTime,
      endTime: (r) => r.endTime,
      type: (r) => r.type,
      application: (r) => r.application?.name ?? "",
      environment: (r) => r.environmentName,
      department: (r) => r.departmentName ?? "",
      impact: (r) => r.impact,
      approval: (r) => r.approvalStatus,
      requestor: (r) => r.requestor ?? "",
      notes: (r) => r.notes ?? "",
    },
  });
  const [allRows, setAllRows] = useState<MaintenanceRow[]>([]);
  const [apps, setApps] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [rowsRes, appsRes] = await Promise.all([
        safeFetchJson<typeof allRows>("/api/planned-maintenance", { signal: ac.signal, label: "planned-maintenance" }),
        safeFetchJson<{ id: string; name: string }[]>("/api/applications", { signal: ac.signal, label: "applications" }),
      ]);
      if (ac.signal.aborted) return;
      if (rowsRes.ok) setAllRows(rowsRes.data);
      if (appsRes.ok) setApps(appsRes.data);
    })();
    return () => ac.abort();
  }, []);

  const types = useMemo(() => [...new Set(allRows.map((r) => r.type))].sort(), [allRows]);
  const approvals = useMemo(() => [...new Set(allRows.map((r) => r.approvalStatus))].sort(), [allRows]);
  const impacts = useMemo(() => [...new Set(allRows.map((r) => r.impact))].sort(), [allRows]);
  const envs = useMemo(() => [...new Set(allRows.map((r) => r.environmentName))].sort(), [allRows]);

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "planned-maintenance",
    PLANNED_MAINTENANCE_COLUMNS,
    PLANNED_MAINTENANCE_FILTER_FIELDS,
    {
      lockedKeys: ["maintenanceCode"],
      defaultHiddenFilters: PLANNED_MAINTENANCE_DEFAULT_HIDDEN_FILTER_KEYS,
      defaultHiddenColumns: PLANNED_MAINTENANCE_DEFAULT_HIDDEN_COLUMN_KEYS,
    }
  );

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  return (
    <div>
      <TopBar
        pageKey="planned-maintenance"
        trailing={<PageDocumentation pageKey="planned-maintenance" />}
        title="Planned Maintenance" subtitle={`${rows.length} maintenance window${rows.length === 1 ? "" : "s"} scheduled`} />
      {!tablePending && (
        <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
          {isFilterVisible("type") && (
            <FilterSelect value={values.type} onChange={(v) => setFilter("type", v)}>
              <option value="">All types</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("approvalStatus") && (
            <FilterSelect value={values.approvalStatus} onChange={(v) => setFilter("approvalStatus", v)}>
              <option value="">All approval statuses</option>
              {approvals.map((a) => <option key={a} value={a}>{a}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("applicationId") && (
            <FilterSelect value={values.applicationId} onChange={(v) => setFilter("applicationId", v)}>
              <option value="">All applications</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("environmentName") && (
            <FilterSelect value={values.environmentName} onChange={(v) => setFilter("environmentName", v)}>
              <option value="">All environments</option>
              {envs.map((e) => <option key={e} value={e}>{e}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("impact") && (
            <FilterSelect value={values.impact} onChange={(v) => setFilter("impact", v)}>
              <option value="">All impacts</option>
              {impacts.map((i) => <option key={i} value={i}>{i}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("requestorQ") && (
            <FilterTextInput
              value={values.requestorQ}
              onChange={(v) => setFilter("requestorQ", v)}
              placeholder="Requestor…"
            />
          )}
          {isFilterVisible("scheduledQ") && (
            <FilterTextInput
              value={values.scheduledQ}
              onChange={(v) => setFilter("scheduledQ", v)}
              placeholder="Scheduled (YYYY-MM-DD)…"
            />
          )}
          {isFilterVisible("notesQ") && (
            <FilterTextInput
              value={values.notesQ}
              onChange={(v) => setFilter("notesQ", v)}
              placeholder="Notes…"
            />
          )}
          {isFilterVisible("maintenanceCodeQ") && (
            <FilterTextInput
              value={values.maintenanceCodeQ}
              onChange={(v) => setFilter("maintenanceCodeQ", v)}
              placeholder="Maintenance ID…"
            />
          )}
          {isFilterVisible("startTimeQ") && (
            <FilterTextInput
              value={values.startTimeQ}
              onChange={(v) => setFilter("startTimeQ", v)}
              placeholder="Start time…"
            />
          )}
          {isFilterVisible("endTimeQ") && (
            <FilterTextInput
              value={values.endTimeQ}
              onChange={(v) => setFilter("endTimeQ", v)}
              placeholder="End time…"
            />
          )}
          {isFilterVisible("departmentQ") && (
            <FilterTextInput
              value={values.departmentQ}
              onChange={(v) => setFilter("departmentQ", v)}
              placeholder="Department…"
            />
          )}
        </TableFilterBar>
      )}
      {tablePending ? (
        <TableSkeleton columns={PLANNED_MAINTENANCE_COLUMNS.length} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-12 text-center">
          <CalendarClock className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{hasActive ? "No windows match the selected filters." : "No planned maintenance recorded."}</p>
        </div>
      ) : (
        <DataTable title="Maintenance Calendar" icon={CalendarClock} toolbar={<TablePageToolbar columnPicker={columnPicker} presets={MAINTENANCE_SORT_PRESETS} sortKey={sortKey} sortDir={sortDir} onSelectSort={setSort} />}>
          <div className="overflow-x-auto">
            <table className={dataTableTableClass}>
              <thead>
                <DataTableHeadRow
                  columns={PLANNED_MAINTENANCE_COLUMNS}
                  isColumnVisible={isColumnVisible}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={tableRow}>
                    {isColumnVisible("maintenanceCode") && (
                      <td className={`${tableCell} whitespace-nowrap`}>
                        <ProgressLink href={`/planned-maintenance/${r.id}`} className="font-mono text-xs text-brand-600 dark:text-brand-400 hover:underline">
                          {r.maintenanceCode}
                        </ProgressLink>
                      </td>
                    )}
                    {isColumnVisible("scheduledDate") && <td className={`${tableCell} whitespace-nowrap text-gray-500`}>{formatDate(r.scheduledDate)}</td>}
                    {isColumnVisible("startTime") && <td className={`${tableCell} whitespace-nowrap`}>{r.startTime}</td>}
                    {isColumnVisible("endTime") && <td className={`${tableCell} whitespace-nowrap`}>{r.endTime}</td>}
                    {isColumnVisible("type") && <td className={`${tableCell} whitespace-nowrap`}>{r.type}</td>}
                    {isColumnVisible("application") && <td className={`${tableCell} whitespace-nowrap`}>{r.application?.name ?? "—"}</td>}
                    {isColumnVisible("environment") && <td className={`${tableCell} whitespace-nowrap`}>{r.environmentName}</td>}
                    {isColumnVisible("department") && <td className={`${tableCell} whitespace-nowrap`}>{r.departmentName ?? "—"}</td>}
                    {isColumnVisible("impact") && <td className={`${tableCell} whitespace-nowrap`}>{r.impact}</td>}
                    {isColumnVisible("requestor") && <td className={`${tableCell} whitespace-nowrap`}>{r.requestor ?? "—"}</td>}
                    {isColumnVisible("approval") && <td className={`${tableCell} whitespace-nowrap`}><StatusBadge status={r.approvalStatus} /></td>}
                    {isColumnVisible("notes") && <td className={`${tableCell} truncate max-w-[240px]`} title={r.notes ?? ""}>{r.notes ?? "—"}</td>}
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
