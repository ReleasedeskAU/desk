"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertOctagon } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import {
  INCIDENT_COLUMNS,
  INCIDENT_DEFAULT_HIDDEN_FILTER_KEYS,
  INCIDENT_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { cn, formatDate } from "@/lib/utils";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { INCIDENT_SORT_PRESETS } from "@/lib/table-sort-presets";
import { DataTable, DataTableHeadRow, dataTableTableClass, tableCell, tableRow } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { useFilteredFetch } from "@/hooks/useTableFilters";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { INCIDENTS_FILTER_SCHEMA } from "@/lib/table-filters";
import { loadJsonEffect } from "@/lib/safe-fetch";

type IncidentRow = {
  id: string;
  incidentCode: string;
  timestamp: string;
  application: { id: string; name: string };
  departmentName: string | null;
  severity: string;
  title: string;
  status: string;
  impact: string;
  assignedTo: string | null;
  relatedReleaseCode: string | null;
  relatedRelease: { id: string; releaseCode: string; name: string } | null;
  environmentName: string;
};

const SEVERITY_CLASSES: Record<string, string> = {
  P1: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
  P2: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300",
  P3: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
};

export default function IncidentsContent() {
  const {
    rows: incidents,
    loading,
    values,
    setFilter,
    setSort,
    clearAll,
    hasActive,
    sortKey,
    sortDir,
    toggleSort,
  } = useFilteredFetch<IncidentRow>("/api/incidents", INCIDENTS_FILTER_SCHEMA, {
    defaultSortKey: "timestamp",
    defaultSortDir: "desc",
    sortAccessors: {
      incidentCode: (r) => r.incidentCode,
      timestamp: (r) => new Date(r.timestamp).getTime(),
      application: (r) => r.application.name,
      department: (r) => r.departmentName ?? "",
      severity: (r) => r.severity,
      title: (r) => r.title,
      status: (r) => r.status,
      impact: (r) => r.impact,
      relatedRelease: (r) => r.relatedRelease?.releaseCode ?? r.relatedReleaseCode ?? "",
      assignedTo: (r) => r.assignedTo ?? "",
      environment: (r) => r.environmentName,
    },
  });
  const [apps, setApps] = useState<{ id: string; name: string }[]>([]);

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "incidents",
    INCIDENT_COLUMNS,
    INCIDENT_FILTER_FIELDS,
    {
      lockedKeys: ["incidentCode"],
      defaultHiddenFilters: INCIDENT_DEFAULT_HIDDEN_FILTER_KEYS,
    }
  );

  useEffect(() => {
    return loadJsonEffect<{ id: string; name: string }[]>("/api/applications", setApps, { label: "applications" });
  }, []);

  const severities = useMemo(() => [...new Set(incidents.map((i) => i.severity))].sort(), [incidents]);
  const statuses = useMemo(() => [...new Set(incidents.map((i) => i.status))].sort(), [incidents]);
  const impacts = useMemo(() => [...new Set(incidents.map((i) => i.impact).filter(Boolean))].sort(), [incidents]);
  const envs = useMemo(() => [...new Set(incidents.map((i) => i.environmentName))].sort(), [incidents]);

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  return (
    <div>
      <TopBar
        pageKey="incidents"
        trailing={<PageDocumentation pageKey="incidents" />}
        title="Incidents"
        subtitle={`${incidents.length} incident${incidents.length === 1 ? "" : "s"} across all applications`}
      />

      {!tablePending && (
        <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
          {isFilterVisible("severity") && (
            <FilterSelect value={values.severity} onChange={(v) => setFilter("severity", v)}>
              <option value="">All severities</option>
              {severities.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("status") && (
            <FilterSelect value={values.status} onChange={(v) => setFilter("status", v)}>
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("applicationId") && (
            <FilterSelect value={values.applicationId} onChange={(v) => setFilter("applicationId", v)}>
              <option value="">All applications</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("environmentName") && (
            <FilterSelect value={values.environmentName} onChange={(v) => setFilter("environmentName", v)}>
              <option value="">All environments</option>
              {envs.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("assignedToQ") && (
            <FilterTextInput
              value={values.assignedToQ}
              onChange={(v) => setFilter("assignedToQ", v)}
              placeholder="Assigned to…"
            />
          )}
          {isFilterVisible("titleQ") && (
            <FilterTextInput
              value={values.titleQ}
              onChange={(v) => setFilter("titleQ", v)}
              placeholder="Title…"
            />
          )}
          {isFilterVisible("incidentCodeQ") && (
            <FilterTextInput
              value={values.incidentCodeQ}
              onChange={(v) => setFilter("incidentCodeQ", v)}
              placeholder="Incident ID…"
            />
          )}
          {isFilterVisible("impact") && (
            <FilterSelect value={values.impact} onChange={(v) => setFilter("impact", v)}>
              <option value="">All impacts</option>
              {impacts.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("relatedReleaseQ") && (
            <FilterTextInput
              value={values.relatedReleaseQ}
              onChange={(v) => setFilter("relatedReleaseQ", v)}
              placeholder="Related release…"
            />
          )}
          {isFilterVisible("timestampQ") && (
            <FilterTextInput
              value={values.timestampQ}
              onChange={(v) => setFilter("timestampQ", v)}
              placeholder="Timestamp (YYYY-MM-DD)…"
            />
          )}
        </TableFilterBar>
      )}

      {tablePending ? (
        <TableSkeleton columns={INCIDENT_COLUMNS.length} />
      ) : incidents.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-900">
          <AlertOctagon className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400">
            {hasActive ? "No incidents match the selected filters." : "No incidents recorded."}
          </p>
        </div>
      ) : (
        <DataTable title="All Incidents" icon={AlertOctagon} toolbar={<TablePageToolbar columnPicker={columnPicker} presets={INCIDENT_SORT_PRESETS} sortKey={sortKey} sortDir={sortDir} onSelectSort={setSort} />}>
          <table className={dataTableTableClass}>
            <thead>
              <DataTableHeadRow
                columns={INCIDENT_COLUMNS}
                isColumnVisible={isColumnVisible}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
            </thead>
            <tbody>
              {incidents.map((i) => (
                <tr key={i.id} className={tableRow}>
                  {isColumnVisible("incidentCode") && (
                    <td className={`${tableCell} whitespace-nowrap`}>
                      <ProgressLink href={`/incidents/${i.id}`} className="font-mono text-xs text-brand-600 dark:text-brand-400 hover:underline">
                        {i.incidentCode}
                      </ProgressLink>
                    </td>
                  )}
                  {isColumnVisible("timestamp") && <td className={`${tableCell} whitespace-nowrap text-gray-500`}>{formatDate(i.timestamp)}</td>}
                  {isColumnVisible("application") && <td className={`${tableCell} whitespace-nowrap`}>{i.application.name}</td>}
                  {isColumnVisible("department") && <td className={`${tableCell} whitespace-nowrap`}>{i.departmentName ?? "—"}</td>}
                  {isColumnVisible("severity") && (
                    <td className={`${tableCell} whitespace-nowrap`}>
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold", SEVERITY_CLASSES[i.severity] ?? SEVERITY_CLASSES.P3)}>
                        {i.severity}
                      </span>
                    </td>
                  )}
                  {isColumnVisible("title") && <td className={`${tableCell} max-w-[280px] truncate`} title={i.title}>{i.title}</td>}
                  {isColumnVisible("status") && <td className={`${tableCell} whitespace-nowrap`}><StatusBadge status={i.status} /></td>}
                  {isColumnVisible("impact") && <td className={`${tableCell} whitespace-nowrap`}>{i.impact}</td>}
                  {isColumnVisible("relatedRelease") && (
                    <td className={`${tableCell} whitespace-nowrap`}>
                      {i.relatedRelease ? (
                        <ProgressLink href={`/releases/${i.relatedRelease.id}`} className="text-xs text-brand-600 hover:underline dark:text-brand-400">
                          {i.relatedRelease.releaseCode}
                        </ProgressLink>
                      ) : i.relatedReleaseCode ? (
                        <span className="text-xs text-gray-500">{i.relatedReleaseCode}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  {isColumnVisible("assignedTo") && <td className={`${tableCell} whitespace-nowrap`}>{i.assignedTo ?? "—"}</td>}
                  {isColumnVisible("environment") && <td className={`${tableCell} whitespace-nowrap`}>{i.environmentName}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}
    </div>
  );
}
