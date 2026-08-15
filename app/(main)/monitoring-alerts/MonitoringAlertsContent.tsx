"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Plus } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import {
  MONITORING_ALERT_COLUMNS,
  MONITORING_ALERT_DEFAULT_HIDDEN_COLUMN_KEYS,
  MONITORING_ALERTS_DEFAULT_HIDDEN_FILTER_KEYS,
  MONITORING_ALERTS_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { cn, formatDate } from "@/lib/utils";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { ALERT_SORT_PRESETS } from "@/lib/table-sort-presets";
import { DataTable, DataTableHeadRow, dataTableTableClass, tableCell, tableRow } from "@/components/ui/data-table";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useFilteredFetch } from "@/hooks/useTableFilters";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { loadJsonEffect, safeFetchJson } from "@/lib/safe-fetch";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { MONITORING_ALERTS_FILTER_SCHEMA } from "@/lib/table-filters";
import { MonitoringAlertFormModal } from "@/components/monitoring-alerts/MonitoringAlertFormModal";
import { canEdit as sessionCanEdit, type SessionUser } from "@/lib/auth/roles";
import { taBtnPrimary } from "@/lib/styles";
import { useVoiceListContext } from "@/hooks/useVoiceListContext";
import { useEntityLifecycleStatuses } from "@/hooks/useEntityLifecycleStatuses";

type AlertRow = {
  id: string;
  alertCode: string;
  timestamp: string;
  application: { id: string; name: string };
  departmentName: string | null;
  alertType: string;
  severity: string;
  metric: string;
  threshold: string | null;
  currentValue: string | null;
  status: string;
  assignedTo: string | null;
  environmentName: string;
};

const SEVERITY_CLASSES: Record<string, string> = {
  Critical: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
  Warning: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  Info: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
};

export default function MonitoringAlertsContent() {
  const {
    rows: alerts,
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
  } = useFilteredFetch<AlertRow>("/api/monitoring-alerts", MONITORING_ALERTS_FILTER_SCHEMA, {
    defaultSortKey: "timestamp",
    defaultSortDir: "desc",
    sortAccessors: {
      alertCode: (r) => r.alertCode,
      timestamp: (r) => new Date(r.timestamp).getTime(),
      application: (r) => r.application.name,
      department: (r) => r.departmentName ?? "",
      alertType: (r) => r.alertType,
      severity: (r) => r.severity,
      metric: (r) => r.metric,
      threshold: (r) => r.threshold ?? "",
      currentValue: (r) => r.currentValue ?? "",
      status: (r) => r.status,
      assignedTo: (r) => r.assignedTo ?? "",
      environment: (r) => r.environmentName,
    },
  });
  const [apps, setApps] = useState<{ id: string; name: string }[]>([]);
  const [allAlerts, setAllAlerts] = useState<AlertRow[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const canEdit = sessionCanEdit(user);
  const lifecycle = useEntityLifecycleStatuses("/api/alert-lifecycle-config");
  const statusOptions = useMemo(
    () => lifecycle.filterOptions(allAlerts.map((a) => a.status)),
    [lifecycle, allAlerts]
  );

  useEffect(() => {
    return loadJsonEffect<{ id: string; name: string }[]>("/api/applications", setApps, { label: "applications" });
  }, []);

  useEffect(() => {
    return loadJsonEffect<AlertRow[]>("/api/monitoring-alerts", setAllAlerts, { label: "monitoring-alerts" });
  }, []);

  useEffect(() => {
    return loadJsonEffect<{ user: SessionUser }>("/api/auth/me", (data) => setUser(data.user), {
      label: "monitoring-alerts-auth",
    });
  }, []);

  const severities = useMemo(() => [...new Set(allAlerts.map((a) => a.severity))].sort(), [allAlerts]);
  const alertTypes = useMemo(() => [...new Set(allAlerts.map((a) => a.alertType))].sort(), [allAlerts]);
  const envs = useMemo(() => [...new Set(allAlerts.map((a) => a.environmentName))].sort(), [allAlerts]);
  const departments = useMemo(
    () => [...new Set(allAlerts.map((a) => a.departmentName).filter(Boolean) as string[])].sort(),
    [allAlerts]
  );

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "monitoring-alerts",
    MONITORING_ALERT_COLUMNS,
    MONITORING_ALERTS_FILTER_FIELDS,
    {
      lockedKeys: ["alertCode"],
      defaultHiddenFilters: MONITORING_ALERTS_DEFAULT_HIDDEN_FILTER_KEYS,
      defaultHiddenColumns: MONITORING_ALERT_DEFAULT_HIDDEN_COLUMN_KEYS,
    }
  );

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  const voiceVisibleRows = useMemo(
    () =>
      alerts.map((a) => ({
        code: a.alertCode,
        label: `${a.alertCode} — ${a.application.name}`,
        path: `/monitoring-alerts/${a.id}`,
      })),
    [alerts]
  );
  useVoiceListContext(
    "/monitoring-alerts",
    "alert",
    voiceVisibleRows,
    hasActive ? "filtered" : undefined
  );

  return (
    <div>
      <TopBar
        pageKey="monitoring-alerts"
        trailing={
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <button type="button" className={cn(taBtnPrimary, "text-sm")} onClick={() => setModalOpen(true)}>
                <Plus className="mr-1 inline h-4 w-4" /> New Monitoring Alert
              </button>
            ) : null}
            <PageDocumentation pageKey="monitoring-alerts" />
          </div>
        }
        title="Monitoring Alerts"
        subtitle={`${alerts.length} alert${alerts.length === 1 ? "" : "s"} across all applications`}
      />
      <MonitoringAlertFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          refetch();
          void safeFetchJson<AlertRow[]>("/api/monitoring-alerts", {
            label: "monitoring-alerts-post-create-refresh",
          }).then((result) => {
            if (result.ok) setAllAlerts(result.data);
          });
        }}
        alertTypeOptions={alertTypes}
        statusOptions={lifecycle.createOptions}
        defaultStatus={lifecycle.defaultStatus || "Active"}
      />
      {!tablePending && (
        <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
          {isFilterVisible("severity") && (
            <FilterSelect value={values.severity} onChange={(v) => setFilter("severity", v)}>
              <option value="">All severities</option>
              {severities.map((s) => <option key={s} value={s}>{s}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("status") && (
            <FilterSelect value={values.status} onChange={(v) => setFilter("status", v)}>
              <option value="">All statuses</option>
              {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("applicationId") && (
            <FilterSelect value={values.applicationId} onChange={(v) => setFilter("applicationId", v)}>
              <option value="">All applications</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("alertType") && (
            <FilterSelect value={values.alertType} onChange={(v) => setFilter("alertType", v)}>
              <option value="">All alert types</option>
              {alertTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("environmentName") && (
            <FilterSelect value={values.environmentName} onChange={(v) => setFilter("environmentName", v)}>
              <option value="">All environments</option>
              {envs.map((e) => <option key={e} value={e}>{e}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("assignedToQ") && (
            <FilterTextInput
              value={values.assignedToQ}
              onChange={(v) => setFilter("assignedToQ", v)}
              placeholder="Assigned to…"
            />
          )}
          {isFilterVisible("alertCodeQ") && (
            <FilterTextInput
              value={values.alertCodeQ}
              onChange={(v) => setFilter("alertCodeQ", v)}
              placeholder="Alert ID…"
            />
          )}
          {isFilterVisible("metricQ") && (
            <FilterTextInput
              value={values.metricQ}
              onChange={(v) => setFilter("metricQ", v)}
              placeholder="Metric…"
            />
          )}
          {isFilterVisible("thresholdQ") && (
            <FilterTextInput
              value={values.thresholdQ}
              onChange={(v) => setFilter("thresholdQ", v)}
              placeholder="Threshold…"
            />
          )}
          {isFilterVisible("currentValueQ") && (
            <FilterTextInput
              value={values.currentValueQ}
              onChange={(v) => setFilter("currentValueQ", v)}
              placeholder="Current value…"
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
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </FilterSelect>
          )}
        </TableFilterBar>
      )}
      {tablePending ? (
        <TableSkeleton columns={MONITORING_ALERT_COLUMNS.length} />
      ) : alerts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-12 text-center">
          <Bell className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{hasActive ? "No alerts match the selected filters." : "No monitoring alerts recorded."}</p>
        </div>
      ) : (
        <DataTable title="All Monitoring Alerts" icon={Bell} toolbar={<TablePageToolbar columnPicker={columnPicker} presets={ALERT_SORT_PRESETS} sortKey={sortKey} sortDir={sortDir} onSelectSort={setSort} />}>
          <div className="overflow-x-auto">
            <table className={dataTableTableClass}>
              <thead>
                <DataTableHeadRow
                  columns={MONITORING_ALERT_COLUMNS}
                  isColumnVisible={isColumnVisible}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} className={tableRow}>
                    {isColumnVisible("alertCode") && (
                    <td className={`${tableCell} whitespace-nowrap`}>
                      <ProgressLink href={`/monitoring-alerts/${a.id}`} data-voice-row={a.alertCode} className="font-mono text-xs text-brand-600 dark:text-brand-400 hover:underline">
                        {a.alertCode}
                      </ProgressLink>
                    </td>
                    )}
                    {isColumnVisible("timestamp") && <td className={`${tableCell} whitespace-nowrap text-gray-500`}>{formatDate(a.timestamp)}</td>}
                    {isColumnVisible("application") && <td className={`${tableCell} whitespace-nowrap`}>{a.application.name}</td>}
                    {isColumnVisible("department") && <td className={`${tableCell} whitespace-nowrap`}>{a.departmentName ?? "—"}</td>}
                    {isColumnVisible("alertType") && <td className={`${tableCell} whitespace-nowrap`}>{a.alertType}</td>}
                    {isColumnVisible("severity") && (
                    <td className={`${tableCell} whitespace-nowrap`}>
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold", SEVERITY_CLASSES[a.severity] ?? SEVERITY_CLASSES.Info)}>{a.severity}</span>
                    </td>
                    )}
                    {isColumnVisible("metric") && <td className={`${tableCell} whitespace-nowrap`}>{a.metric}</td>}
                    {isColumnVisible("threshold") && <td className={`${tableCell} whitespace-nowrap`}>{a.threshold ?? "—"}</td>}
                    {isColumnVisible("currentValue") && <td className={`${tableCell} whitespace-nowrap`}>{a.currentValue ?? "—"}</td>}
                    {isColumnVisible("status") && <td className={`${tableCell} whitespace-nowrap`}><StatusBadge status={a.status} /></td>}
                    {isColumnVisible("assignedTo") && <td className={`${tableCell} whitespace-nowrap`}>{a.assignedTo ?? "—"}</td>}
                    {isColumnVisible("environment") && <td className={`${tableCell} whitespace-nowrap`}>{a.environmentName}</td>}
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
