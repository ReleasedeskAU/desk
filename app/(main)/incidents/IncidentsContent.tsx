"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertOctagon, Plus } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import {
  INCIDENT_COLUMNS,
  INCIDENT_DEFAULT_HIDDEN_COLUMN_KEYS,
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
import { safeFetchJson } from "@/lib/safe-fetch";
import { IncidentFormModal } from "@/components/incidents/IncidentFormModal";
import { canEdit as sessionCanEdit, type SessionUser } from "@/lib/auth/roles";
import { taBtnPrimary } from "@/lib/styles";
import { useVoiceListContext } from "@/hooks/useVoiceListContext";
import { useEntityLifecycleStatuses } from "@/hooks/useEntityLifecycleStatuses";

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

const SEVERITY_P1 =
  "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300";
const SEVERITY_P2 =
  "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300";
const SEVERITY_P3 =
  "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300";
const SEVERITY_P4 =
  "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300";

const SEVERITY_CLASSES: Record<string, string> = {
  P1: SEVERITY_P1,
  "P1 - Critical": SEVERITY_P1,
  P2: SEVERITY_P2,
  "P2 - High": SEVERITY_P2,
  P3: SEVERITY_P3,
  "P3 - Medium": SEVERITY_P3,
  P4: SEVERITY_P4,
  "P4 - Low": SEVERITY_P4,
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
    refetch,
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
  const [user, setUser] = useState<SessionUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const canEdit = sessionCanEdit(user);
  const lifecycle = useEntityLifecycleStatuses("/api/incident-lifecycle-config");
  const statusOptions = useMemo(
    () => lifecycle.filterOptions(incidents.map((i) => i.status)),
    [lifecycle, incidents]
  );
  const openLabelSet = useMemo(
    () => new Set(lifecycle.openLabels.map((l) => l.toLocaleLowerCase())),
    [lifecycle.openLabels]
  );
  const openCount = incidents.filter((i) =>
    openLabelSet.has(i.status.toLocaleLowerCase())
  ).length;

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "incidents",
    INCIDENT_COLUMNS,
    INCIDENT_FILTER_FIELDS,
    {
      lockedKeys: ["incidentCode"],
      defaultHiddenFilters: INCIDENT_DEFAULT_HIDDEN_FILTER_KEYS,
      defaultHiddenColumns: INCIDENT_DEFAULT_HIDDEN_COLUMN_KEYS,
    }
  );

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [appsRes, meRes] = await Promise.all([
        safeFetchJson<{ id: string; name: string }[]>("/api/applications", { signal: ac.signal, label: "applications" }),
        safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal: ac.signal, label: "incidents-auth" }),
      ]);
      if (ac.signal.aborted) return;
      if (appsRes.ok) setApps(appsRes.data);
      if (meRes.ok) setUser(meRes.data.user);
    })();
    return () => ac.abort();
  }, []);

  const severities = useMemo(() => [...new Set(incidents.map((i) => i.severity))].sort(), [incidents]);
  const impacts = useMemo(() => [...new Set(incidents.map((i) => i.impact).filter(Boolean))].sort(), [incidents]);
  const envs = useMemo(() => [...new Set(incidents.map((i) => i.environmentName))].sort(), [incidents]);
  const departments = useMemo(
    () => [...new Set(incidents.map((i) => i.departmentName).filter(Boolean) as string[])].sort(),
    [incidents]
  );

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  const voiceVisibleRows = useMemo(
    () =>
      incidents.map((i) => ({
        code: i.incidentCode,
        label: `${i.incidentCode} — ${i.title}`,
        path: `/incidents/${i.id}`,
      })),
    [incidents]
  );
  useVoiceListContext(
    "/incidents",
    "incident",
    voiceVisibleRows,
    hasActive ? "filtered" : undefined
  );

  return (
    <div>
      <TopBar
        pageKey="incidents"
        trailing={
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <button type="button" className={cn(taBtnPrimary, "text-sm")} onClick={() => setModalOpen(true)}>
                <Plus className="mr-1 inline h-4 w-4" /> Add New Incident
              </button>
            ) : null}
            <PageDocumentation pageKey="incidents" />
          </div>
        }
        title="Incidents"
        subtitle={
          incidents.length > 0
            ? `${incidents.length} incident${incidents.length === 1 ? "" : "s"} across all applications${
                openCount > 0 ? ` · ${openCount} open or in progress` : ""
              }`
            : "No incidents recorded"
        }
      />
      <IncidentFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => refetch()}
        statusOptions={lifecycle.createOptions}
        defaultStatus={lifecycle.defaultStatus || "Open"}
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
              {statusOptions.map((s) => (
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
          {isFilterVisible("departmentQ") && (
            <FilterSelect value={values.departmentQ} onChange={(v) => setFilter("departmentQ", v)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </FilterSelect>
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
                      <ProgressLink href={`/incidents/${i.id}`} data-voice-row={i.incidentCode} className="font-mono text-xs text-brand-600 dark:text-brand-400 hover:underline">
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
