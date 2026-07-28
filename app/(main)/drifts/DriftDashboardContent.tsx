"use client";

import { useEffect, useMemo, useState } from "react";
import { GitCompareArrows, Plus } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import {
  DRIFT_COLUMNS,
  DRIFT_DEFAULT_HIDDEN_COLUMN_KEYS,
  DRIFT_DEFAULT_HIDDEN_FILTER_KEYS,
  DRIFT_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { cn, formatDate } from "@/lib/utils";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { DRIFT_SORT_PRESETS } from "@/lib/table-sort-presets";
import { DataTable, DataTableHeadRow, dataTableTableClass, tableCell, tableRow } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useFilteredFetch } from "@/hooks/useTableFilters";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { DRIFTS_FILTER_SCHEMA } from "@/lib/table-filters";
import { safeFetchJson } from "@/lib/safe-fetch";
import { DriftFormModal } from "@/components/drifts/DriftFormModal";
import { canEdit as sessionCanEdit, type SessionUser } from "@/lib/auth/roles";
import { taBtnPrimary } from "@/lib/styles";
import { useVoiceListContext } from "@/hooks/useVoiceListContext";

type ReferenceDataRow = { id: string; category: string; value: string; sortOrder: number; active: boolean };

type DriftRow = {
  id: string;
  driftCode: string;
  release: { id: string; releaseCode: string; name: string; status: string };
  application: { id: string; name: string };
  departmentName: string | null;
  environmentName: string;
  driftType: string;
  driftCategory: string | null;
  detectedDate: string;
  severity: string;
  description: string;
  impactOnRelease: string | null;
  remediationAction: string | null;
  status: string;
  etaToFix: string | null;
};

const SEVERITY_CLASSES: Record<string, string> = {
  Critical: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
  High: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300",
  Medium: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  Low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
};

export default function DriftDashboardContent() {
  const {
    rows: drifts,
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
  } = useFilteredFetch<DriftRow>("/api/drifts", DRIFTS_FILTER_SCHEMA, {
    defaultSortKey: "detected",
    defaultSortDir: "desc",
    sortAccessors: {
      driftCode: (r) => r.driftCode,
      release: (r) => r.release.releaseCode,
      releaseName: (r) => r.release.name,
      application: (r) => r.application.name,
      department: (r) => r.departmentName ?? "",
      environment: (r) => r.environmentName,
      type: (r) => r.driftType,
      category: (r) => r.driftCategory ?? "",
      description: (r) => r.description,
      impactOnRelease: (r) => r.impactOnRelease ?? "",
      remediationAction: (r) => r.remediationAction ?? "",
      severity: (r) => r.severity,
      status: (r) => r.status,
      detected: (r) => new Date(r.detectedDate).getTime(),
      etaToFix: (r) => (r.etaToFix ? new Date(r.etaToFix).getTime() : 0),
    },
  });
  const [driftTypes, setDriftTypes] = useState<ReferenceDataRow[]>([]);
  const [apps, setApps] = useState<{ id: string; name: string }[]>([]);
  const [allDrifts, setAllDrifts] = useState<DriftRow[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const canEdit = sessionCanEdit(user);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [typesRes, appsRes, driftsRes, meRes] = await Promise.all([
        safeFetchJson<ReferenceDataRow[]>("/api/reference-data?category=drift_type", { signal: ac.signal, label: "drift-types" }),
        safeFetchJson<{ id: string; name: string }[]>("/api/applications", { signal: ac.signal, label: "applications" }),
        safeFetchJson<DriftRow[]>("/api/drifts", { signal: ac.signal, label: "drifts" }),
        safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal: ac.signal, label: "drifts-auth" }),
      ]);
      if (ac.signal.aborted) return;
      if (typesRes.ok) setDriftTypes(typesRes.data);
      if (appsRes.ok) setApps(appsRes.data);
      if (driftsRes.ok) setAllDrifts(driftsRes.data);
      if (meRes.ok) setUser(meRes.data.user);
    })();
    return () => ac.abort();
  }, []);

  const severities = useMemo(() => [...new Set(allDrifts.map((d) => d.severity))].sort(), [allDrifts]);
  const statuses = useMemo(() => [...new Set(allDrifts.map((d) => d.status))].sort(), [allDrifts]);
  const environments = useMemo(
    () => [...new Set(allDrifts.map((d) => d.environmentName).filter(Boolean))].sort(),
    [allDrifts]
  );
  const categories = useMemo(
    () => [...new Set(allDrifts.map((d) => d.driftCategory).filter(Boolean) as string[])].sort(),
    [allDrifts]
  );
  const departments = useMemo(
    () => [...new Set(allDrifts.map((d) => d.departmentName).filter(Boolean) as string[])].sort(),
    [allDrifts]
  );

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "drifts",
    DRIFT_COLUMNS,
    DRIFT_FILTER_FIELDS,
    {
      lockedKeys: ["driftCode"],
      defaultHiddenFilters: DRIFT_DEFAULT_HIDDEN_FILTER_KEYS,
      defaultHiddenColumns: DRIFT_DEFAULT_HIDDEN_COLUMN_KEYS,
    }
  );

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  const voiceVisibleRows = useMemo(
    () =>
      drifts.map((d) => ({
        code: d.driftCode,
        label: `${d.driftCode} — ${d.release.releaseCode}`,
        path: `/drifts/${d.id}`,
      })),
    [drifts]
  );
  useVoiceListContext(
    "/drifts",
    "drift",
    voiceVisibleRows,
    hasActive ? "filtered" : undefined
  );

  return (
    <div>
      <TopBar
        pageKey="drifts"
        trailing={
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <button type="button" className={cn(taBtnPrimary, "text-sm")} onClick={() => setModalOpen(true)}>
                <Plus className="mr-1 inline h-4 w-4" /> Add New Drift
              </button>
            ) : null}
            <PageDocumentation pageKey="drifts" />
          </div>
        }
        title="Drift Dashboard"
        subtitle={`${drifts.length} drift${drifts.length === 1 ? "" : "s"} detected across environments`}
      />
      <DriftFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          refetch();
          void safeFetchJson<DriftRow[]>("/api/drifts", { label: "drifts-post-create-refresh" }).then((result) => {
            if (result.ok) setAllDrifts(result.data);
          });
        }}
        categoryOptions={categories}
      />
      {!tablePending && (
        <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
          {isFilterVisible("driftType") && (
            <FilterSelect value={values.driftType} onChange={(v) => setFilter("driftType", v)}>
              <option value="">All drift types</option>
              {driftTypes.map((t) => <option key={t.id} value={t.value}>{t.value}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("severity") && (
            <FilterSelect value={values.severity} onChange={(v) => setFilter("severity", v)}>
              <option value="">All severities</option>
              {severities.map((s) => <option key={s} value={s}>{s}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("status") && (
            <FilterSelect value={values.status} onChange={(v) => setFilter("status", v)}>
              <option value="">All statuses</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("applicationId") && (
            <FilterSelect value={values.applicationId} onChange={(v) => setFilter("applicationId", v)}>
              <option value="">All applications</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("releaseCodeQ") && (
            <FilterTextInput
              value={values.releaseCodeQ}
              onChange={(v) => setFilter("releaseCodeQ", v)}
              placeholder="Release…"
            />
          )}
          {isFilterVisible("driftCodeQ") && (
            <FilterTextInput
              value={values.driftCodeQ}
              onChange={(v) => setFilter("driftCodeQ", v)}
              placeholder="Drift ID…"
            />
          )}
          {isFilterVisible("environmentName") && (
            <FilterSelect value={values.environmentName} onChange={(v) => setFilter("environmentName", v)}>
              <option value="">All environments</option>
              {environments.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("detectedDateQ") && (
            <FilterTextInput
              value={values.detectedDateQ}
              onChange={(v) => setFilter("detectedDateQ", v)}
              placeholder="Detected (YYYY-MM-DD)…"
            />
          )}
          {isFilterVisible("releaseNameQ") && (
            <FilterTextInput
              value={values.releaseNameQ}
              onChange={(v) => setFilter("releaseNameQ", v)}
              placeholder="Release name…"
            />
          )}
          {isFilterVisible("departmentQ") && (
            <FilterSelect value={values.departmentQ} onChange={(v) => setFilter("departmentQ", v)}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("category") && (
            <FilterSelect value={values.category} onChange={(v) => setFilter("category", v)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </FilterSelect>
          )}
          {isFilterVisible("descriptionQ") && (
            <FilterTextInput
              value={values.descriptionQ}
              onChange={(v) => setFilter("descriptionQ", v)}
              placeholder="Description…"
            />
          )}
          {isFilterVisible("impactOnReleaseQ") && (
            <FilterTextInput
              value={values.impactOnReleaseQ}
              onChange={(v) => setFilter("impactOnReleaseQ", v)}
              placeholder="Impact on release…"
            />
          )}
          {isFilterVisible("remediationActionQ") && (
            <FilterTextInput
              value={values.remediationActionQ}
              onChange={(v) => setFilter("remediationActionQ", v)}
              placeholder="Remediation…"
            />
          )}
          {isFilterVisible("etaToFixQ") && (
            <FilterTextInput
              value={values.etaToFixQ}
              onChange={(v) => setFilter("etaToFixQ", v)}
              placeholder="ETA to fix (YYYY-MM-DD)…"
            />
          )}
        </TableFilterBar>
      )}
      {tablePending ? (
        <TableSkeleton columns={DRIFT_COLUMNS.length} />
      ) : drifts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-12 text-center">
          <GitCompareArrows className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{hasActive ? "No drifts match the selected filters." : "No configuration drifts detected."}</p>
        </div>
      ) : (
        <DataTable title="All Drifts" icon={GitCompareArrows} toolbar={<TablePageToolbar columnPicker={columnPicker} presets={DRIFT_SORT_PRESETS} sortKey={sortKey} sortDir={sortDir} onSelectSort={setSort} />}>
          <div className="overflow-x-auto">
            <table className={dataTableTableClass}>
              <thead>
                <DataTableHeadRow
                  columns={DRIFT_COLUMNS}
                  isColumnVisible={isColumnVisible}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </thead>
              <tbody>
                {drifts.map((d) => (
                  <tr key={d.id} className={tableRow}>
                    {isColumnVisible("driftCode") && (
                    <td className={`${tableCell} whitespace-nowrap`}>
                      <ProgressLink href={`/drifts/${d.id}`} data-voice-row={d.driftCode} className="font-mono text-xs text-brand-600 dark:text-brand-400 hover:underline">
                        {d.driftCode}
                      </ProgressLink>
                    </td>
                    )}
                    {isColumnVisible("release") && (
                    <td className={`${tableCell} whitespace-nowrap`}>
                      <ProgressLink href={`/releases/${d.release.id}`} className="text-brand-600 dark:text-brand-400 hover:underline text-xs">{d.release.releaseCode}</ProgressLink>
                    </td>
                    )}
                    {isColumnVisible("releaseName") && <td className={`${tableCell} whitespace-nowrap`}>{d.release.name}</td>}
                    {isColumnVisible("application") && <td className={`${tableCell} whitespace-nowrap`}>{d.application.name}</td>}
                    {isColumnVisible("department") && <td className={`${tableCell} whitespace-nowrap`}>{d.departmentName ?? "—"}</td>}
                    {isColumnVisible("environment") && <td className={`${tableCell} whitespace-nowrap`}>{d.environmentName}</td>}
                    {isColumnVisible("type") && <td className={`${tableCell} whitespace-nowrap`}>{d.driftType}</td>}
                    {isColumnVisible("category") && <td className={`${tableCell} whitespace-nowrap`}>{d.driftCategory ?? "—"}</td>}
                    {isColumnVisible("detected") && <td className={`${tableCell} whitespace-nowrap text-gray-500`}>{formatDate(d.detectedDate)}</td>}
                    {isColumnVisible("severity") && (
                    <td className={`${tableCell} whitespace-nowrap`}>
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold", SEVERITY_CLASSES[d.severity] ?? SEVERITY_CLASSES.Medium)}>{d.severity}</span>
                    </td>
                    )}
                    {isColumnVisible("description") && <td className={`${tableCell} max-w-[220px] truncate`} title={d.description}>{d.description}</td>}
                    {isColumnVisible("impactOnRelease") && <td className={`${tableCell} whitespace-nowrap`}>{d.impactOnRelease ?? "—"}</td>}
                    {isColumnVisible("remediationAction") && <td className={`${tableCell} max-w-[220px] truncate`} title={d.remediationAction ?? ""}>{d.remediationAction ?? "—"}</td>}
                    {isColumnVisible("status") && <td className={`${tableCell} whitespace-nowrap`}><StatusBadge status={d.status} /></td>}
                    {isColumnVisible("etaToFix") && <td className={`${tableCell} whitespace-nowrap text-gray-500`}>{d.etaToFix ? formatDate(d.etaToFix) : "—"}</td>}
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
