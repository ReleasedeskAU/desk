"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Package } from "lucide-react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { NeedsAttentionPanel } from "@/components/dashboard/NeedsAttentionPanel";
import { ReleaseFormModal, type ReleaseFormData } from "@/components/releases/ReleaseFormModal";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { ReleaseFiltersBar } from "@/components/releases/ReleaseFiltersBar";
import {
  RELEASE_COLUMNS,
  RELEASE_DEFAULT_HIDDEN_COLUMN_KEYS,
  RELEASE_DEFAULT_HIDDEN_FILTER_KEYS,
  RELEASE_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { DataTable, DataTableHeadRow, dataTableTableClass, tableCell, tableRow } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { useReleaseFilters } from "@/context/ReleaseFiltersContext";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import { useVoiceListContext } from "@/hooks/useVoiceListContext";
import { filterLabel } from "@/lib/release-filters";
import { type NeedsAttentionItem } from "@/lib/needs-attention";
import {
  dbToUnified,
  type UnifiedRelease,
} from "@/lib/unified-releases";
import { formatDate, cn } from "@/lib/utils";
import { RELEASE_TABLE_SORT_PRESETS } from "@/lib/table-sort-presets";
import { readSortFromValues, sortRows } from "@/lib/table-sort";
import { taBtnPrimary } from "@/lib/styles";
import type { SessionUser } from "@/lib/auth/roles";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import { loadJsonEffect } from "@/lib/safe-fetch";



type ReleaseRow = {
  id: string;
  releaseCode: string;
  name: string;
  owner: string;
  status: string;
  releaseDate: string;
  priority: string;
  impact: string;
  departmentId: string;
  department: { name: string };
  applications: { application: { id: string; name: string } }[];
  dependsOn: { dependsOnRelease: { id: string; releaseCode: string; name: string } }[];
  releaseOwner?: { userId: string } | null;
  externalDependencies?: string | null;
  releaseSize?: string | null;
  cabDate?: string | null;
  startDate?: string | null;
  testEnvRequired?: string | null;
  uatEnvRequired?: string | null;
  releaseHealth?: string | null;
  conflictFlag?: boolean;
  conflictId?: string | null;
  conflictingRelease?: string | null;
  conflictType?: string | null;
  conflictNotes?: string | null;
  readinessPercent?: number | null;
  blockers?: string | null;
  vendorMaintenance?: string | null;
  changeFreeze?: string | null;
  regulatory?: string | null;
  approvalStatus?: string | null;
  rollbackPlan?: string | null;
  goLiveChecklistPercent?: number | null;
  deploymentWindow?: string | null;
  devSignoff?: string | null;
  testSignoff?: string | null;
  uatSignoff?: string | null;
  securityClearance?: string | null;
  dressRehearsal?: string | null;
  hypercarePlan?: string | null;
  commsPlan?: string | null;
  trainingStatus?: string | null;
  stakeholders?: { user: { userId: string } }[];
};

export default function ReleasesPageContent() {
  const searchParams = useSearchParams();

  const {
    filters,
    filterQuery,
    hasRefinement,
    departments,
    applications,
    environments,
    bookings,
    dbRows,
    refreshLookups,
    setSort,
    toggleSort,
    loading: filtersLoading,
  } = useReleaseFilters();

  const attentionMode = searchParams.get("attention") === "1";
  const attentionStatusFilter = attentionMode ? searchParams.get("status") : null;

  const [user, setUser] = useState<SessionUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formPrefill, setFormPrefill] = useState<Partial<ReleaseFormData> | null>(null);
  const [attentionItems, setAttentionItems] = useState<NeedsAttentionItem[]>([]);
  type FilterOptionsState = {
    statuses: string[];
    priorities: string[];
    impacts: string[];
    approvalStatuses: string[];
    rollbackPlans: string[];
    deploymentWindows: string[];
    changeFreezes: string[];
    regulatories: string[];
    vendorMaintenances: string[];
    releaseSizes: string[];
    releaseHealths: string[];
    devSignoffs: string[];
    testSignoffs: string[];
    uatSignoffs: string[];
    securityClearances: string[];
    dressRehearsals: string[];
    hypercarePlans: string[];
    commsPlans: string[];
    trainingStatuses: string[];
    conflictTypes: string[];
  };

  const [filterOptions, setFilterOptions] = useState<FilterOptionsState>({
    statuses: [],
    priorities: [],
    impacts: [],
    approvalStatuses: [],
    rollbackPlans: [],
    deploymentWindows: [],
    changeFreezes: [],
    regulatories: [],
    vendorMaintenances: [],
    releaseSizes: [],
    releaseHealths: [],
    devSignoffs: [],
    testSignoffs: [],
    uatSignoffs: [],
    securityClearances: [],
    dressRehearsals: [],
    hypercarePlans: [],
    commsPlans: [],
    trainingStatuses: [],
    conflictTypes: [],
  });

  useEffect(() => {
    type ApiRelease = ReleaseRow & {
      approvalStatus?: string | null;
      rollbackPlan?: string | null;
      deploymentWindow?: string | null;
      changeFreeze?: string | null;
      regulatory?: string | null;
      vendorMaintenance?: string | null;
      releaseSize?: string | null;
      releaseHealth?: string | null;
      devSignoff?: string | null;
      testSignoff?: string | null;
      uatSignoff?: string | null;
      securityClearance?: string | null;
      dressRehearsal?: string | null;
      hypercarePlan?: string | null;
      commsPlan?: string | null;
      trainingStatus?: string | null;
      conflictType?: string | null;
    };

    const uniq = (vals: (string | null | undefined)[]) =>
      [...new Set(vals.map((v) => (v ?? "").trim()).filter(Boolean))].sort();

    // Enum option lists only — Owner/Stakeholder are free-text against live User.name
    // (no client-side name list; see releaseListWhere name contains).
    return loadJsonEffect<ApiRelease[]>("/api/releases", (rows) => {
      setFilterOptions({
        statuses: uniq(rows.map((r) => r.status)),
        priorities: uniq(rows.map((r) => r.priority)),
        impacts: uniq(rows.map((r) => r.impact)),
        approvalStatuses: uniq(rows.map((r) => r.approvalStatus)),
        rollbackPlans: uniq(rows.map((r) => r.rollbackPlan)),
        deploymentWindows: uniq(rows.map((r) => r.deploymentWindow)),
        changeFreezes: uniq(rows.map((r) => r.changeFreeze)),
        regulatories: uniq(rows.map((r) => r.regulatory)),
        vendorMaintenances: uniq(rows.map((r) => r.vendorMaintenance)),
        releaseSizes: uniq(rows.map((r) => r.releaseSize)),
        releaseHealths: uniq(rows.map((r) => r.releaseHealth)),
        devSignoffs: uniq(rows.map((r) => r.devSignoff)),
        testSignoffs: uniq(rows.map((r) => r.testSignoff)),
        uatSignoffs: uniq(rows.map((r) => r.uatSignoff)),
        securityClearances: uniq(rows.map((r) => r.securityClearance)),
        dressRehearsals: uniq(rows.map((r) => r.dressRehearsal)),
        hypercarePlans: uniq(rows.map((r) => r.hypercarePlan)),
        commsPlans: uniq(rows.map((r) => r.commsPlan)),
        trainingStatuses: uniq(rows.map((r) => r.trainingStatus)),
        conflictTypes: uniq(
          rows.flatMap((r) =>
            (r.conflictType ?? "")
              .split(/,\s*/)
              .map((v) => v.trim())
              .filter((v) => v && v !== "-")
          )
        ),
      });
    }, { label: "releases-filter-options" });
  }, []);

  useEffect(() => {
    return loadJsonEffect<{ user: SessionUser }>(
      "/api/auth/me",
      (d) => setUser(d.user),
      { label: "auth-me" },
    );
  }, []);

  useEffect(() => {
    if (!attentionMode) {
      setAttentionItems([]);
      return;
    }
    return loadJsonEffect<{ items?: NeedsAttentionItem[] }>(
      `/api/needs-attention?period=month${filterQuery}`,
      (d) => {
        let items: NeedsAttentionItem[] = d.items ?? [];
        if (attentionStatusFilter) items = items.filter((i) => i.status === attentionStatusFilter);
        setAttentionItems(items);
      },
      { label: "needs-attention" },
    );
  }, [attentionMode, filterQuery, attentionStatusFilter]);

  const scopeLabel = useMemo(
    () => filterLabel(filters, departments, applications, environments),
    [filters, departments, applications, environments]
  );

  const unified = useMemo(() => {
    return (dbRows as ReleaseRow[]).map((r) => dbToUnified(r));
  }, [dbRows]);

  const { sortKey, sortDir } = readSortFromValues(
    {
      sort: filters.sort === "releaseId" ? "releaseCode" : filters.sort === "date" ? "endDate" : filters.sort,
      sortDir: filters.sortDir,
    },
    "releaseCode",
    "asc"
  );

  const sorted = useMemo(
    () =>
      sortRows(unified, sortKey, sortDir, {
        releaseCode: (r) => r.code,
        name: (r) => r.name,
        department: (r) => r.departmentName ?? r.group ?? "",
        application: (r) => r.applicationName ?? "",
        priority: (r) => r.priority ?? "",
        impact: (r) => r.impact ?? "",
        endDate: (r) => new Date(r.date).getTime(),
        status: (r) => r.status,
        conflictId: (r) => r.conflictId ?? "",
        readinessPercent: (r) => r.readinessPercent ?? 0,
        blockers: (r) => r.blockers ?? "",
        cabDate: (r) => (r.cabDate ? new Date(r.cabDate as string).getTime() : 0),
        goLiveChecklistPercent: (r) => r.goLiveChecklistPercent ?? 0,
        releaseHealth: (r) => r.releaseHealth ?? "",
        externalDependencies: (r) => r.externalDependencies ?? "",
        dependsOn: (r) => r.dependsOnLabel ?? "",
      }),
    [unified, sortKey, sortDir]
  );

  const voiceVisibleRows = useMemo(
    () =>
      (attentionMode
        ? attentionItems.map((i) => ({
            code: i.code,
            label: `${i.code} — ${i.name}`,
            path: i.href || `/releases/${i.code}`,
          }))
        : sorted.map((r) => ({
            code: r.code,
            label: `${r.code} — ${r.name}`,
            path: `/releases/${r.code}`,
          }))
      ),
    [attentionMode, attentionItems, sorted]
  );
  useVoiceListContext(
    "/releases",
    "release",
    voiceVisibleRows,
    attentionMode ? "attention" : hasRefinement ? "filtered" : undefined
  );

  const canEdit = sessionCanEdit(user);

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "releases",
    RELEASE_COLUMNS,
    RELEASE_FILTER_FIELDS,
    {
      lockedKeys: ["releaseCode"],
      defaultHiddenFilters: RELEASE_DEFAULT_HIDDEN_FILTER_KEYS,
      defaultHiddenColumns: RELEASE_DEFAULT_HIDDEN_COLUMN_KEYS,
    }
  );

  const tablePending = useTablePageLoading(filtersLoading, prefsLoaded);

  const dbRowById = (id: string) => (dbRows as ReleaseRow[]).find((r) => r.id === id);

  const releaseCodes = useMemo(
    () => (dbRows as ReleaseRow[]).map((r) => r.releaseCode),
    [dbRows]
  );

  return (
    <div>
      <TopBar
        pageKey="releases"
        trailing={
          <div className="flex items-center gap-2">
            {canEdit && !attentionMode && (
              <button
                type="button"
                className={cn(taBtnPrimary, "text-sm")}
                onClick={() => {
                  setFormPrefill(null);
                  setModalOpen(true);
                }}
              >
                <Plus className="mr-1 inline h-4 w-4" /> Add New Release
              </button>
            )}
            <PageDocumentation pageKey="releases" />
          </div>
        }
        title={attentionMode ? "Needs attention" : "Releases"}
        subtitle={
          attentionMode
            ? `${attentionItems.length} blocked or at-risk release${attentionItems.length === 1 ? "" : "s"}${hasRefinement ? ` · ${scopeLabel}` : ""}`
            : hasRefinement
              ? `${unified.length} releases · ${scopeLabel}`
              : `${unified.length} releases`
        }
        highlight
      />

      <ReleaseFiltersBar
        className="mb-4"
        showListFilters={!attentionMode}
        statusOptions={filterOptions.statuses}
        priorityOptions={filterOptions.priorities}
        impactOptions={filterOptions.impacts}
        options={filterOptions}
        manageFilters={!attentionMode ? filterPicker : undefined}
        isFilterVisible={isFilterVisible}
      >
        {attentionMode ? (
          <>
            <ProgressLink
              href="/releases"
              className="inline-flex h-9 items-center rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-600 hover:border-brand-300"
            >
              ← All releases
            </ProgressLink>
            <ProgressLink
              href={`/releases?attention=1${filterQuery}`}
              className={cn(
                "inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium transition-colors",
                !attentionStatusFilter ? "border-brand-500 bg-brand-500 text-white" : "border-gray-200 text-gray-600"
              )}
            >
              All stuck
            </ProgressLink>
            <ProgressLink
              href={`/releases?attention=1&status=Blocked${filterQuery}`}
              className={cn(
                "inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium transition-colors",
                attentionStatusFilter === "Blocked" ? "border-brand-500 bg-brand-500 text-white" : "border-gray-200 text-gray-600"
              )}
            >
              Blocked
            </ProgressLink>
            <ProgressLink
              href={`/releases?attention=1&status=At%20Risk${filterQuery}`}
              className={cn(
                "inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium transition-colors",
                attentionStatusFilter === "At Risk" ? "border-brand-500 bg-brand-500 text-white" : "border-gray-200 text-gray-600"
              )}
            >
              At risk
            </ProgressLink>
          </>
        ) : (
          <ProgressLink
            href={`/releases?attention=1${filterQuery}`}
            className="inline-flex h-9 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-medium text-amber-800 hover:border-amber-300"
          >
            Needs attention
          </ProgressLink>
        )}
      </ReleaseFiltersBar>

      {attentionMode && (
        <NeedsAttentionPanel items={attentionItems} showViewAll={false} />
      )}

      {!attentionMode && tablePending && (
        <TableSkeleton columns={8} rows={10} />
      )}

      {!attentionMode && !tablePending && (
      <DataTable
        title="All Releases"
        icon={Package}
        toolbar={
          !attentionMode ? (
            <TablePageToolbar
              columnPicker={columnPicker}
              presets={RELEASE_TABLE_SORT_PRESETS}
              sortKey={sortKey}
              sortDir={sortDir}
              onSelectSort={setSort}
            />
          ) : undefined
        }
      >
        <table className={dataTableTableClass}>
          <thead>
            <DataTableHeadRow
              columns={RELEASE_COLUMNS}
              isColumnVisible={isColumnVisible}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={RELEASE_COLUMNS.filter((c) => isColumnVisible(c.key)).length} className={`${tableCell} text-center text-gray-400 py-8`}>
                  No releases match the current filters.
                </td>
              </tr>
            ) : (
              sorted.map((r) => (
                <UnifiedRow
                  key={`${r.source}-${r.id}`}
                  row={r}
                  dbRow={dbRowById(r.id)}
                  isColumnVisible={isColumnVisible}
                />
              ))
            )}
          </tbody>
        </table>
      </DataTable>
      )}

      <ReleaseFormModal
        open={modalOpen}
        initial={formPrefill ?? undefined}
        existingReleaseCodes={releaseCodes}
        departments={departments.map((d) => ({ value: d.id, label: d.name }))}
        applications={applications.map((a) => ({
          value: a.id,
          label: a.name,
          departmentId: a.departmentId,
        }))}
        environments={environments.map((e) => ({
          value: e.name,
          label: e.name,
          applicationId: e.applicationId,
        }))}
        releases={(dbRows as ReleaseRow[]).map((r) => ({
          value: r.id,
          label: r.name ? `${r.releaseCode} — ${r.name}` : r.releaseCode,
        }))}
        onClose={() => { setModalOpen(false); setFormPrefill(null); }}
        onSaved={refreshLookups}
      />
    </div>
  );
}

function UnifiedRow({
  row,
  dbRow,
  isColumnVisible,
}: {
  row: UnifiedRelease;
  dbRow?: ReleaseRow;
  isColumnVisible: (key: string) => boolean;
}) {
  const priority = dbRow?.priority ?? row.priority ?? "—";
  const impact = dbRow?.impact ?? row.impact ?? "—";
  const department = row.departmentName ?? row.group ?? "—";
  const applications =
    dbRow?.applications.map((a) => a.application.name).join(", ") ||
    row.applicationName ||
    "—";
  const dependsOn =
    dbRow?.dependsOn.map((d) => d.dependsOnRelease.releaseCode).join(", ") ||
    row.dependsOnLabel ||
    "—";
  const conflictIdRaw = row.conflictId?.trim() ?? "";
  const conflictIds = conflictIdRaw
    ? conflictIdRaw.split(/,\s*/).map((id) => id.trim()).filter(Boolean)
    : [];

  const textCell = (value: string | null | undefined, truncate = false) => (
    <td
      className={cn(
        tableCell,
        "whitespace-nowrap text-xs text-gray-600",
        truncate && "max-w-[200px] truncate"
      )}
      title={truncate ? (value ?? "") : undefined}
    >
      {value?.trim() ? value : "—"}
    </td>
  );

  return (
    <tr className={cn(tableRow, "group")}>
      {isColumnVisible("releaseCode") && (
      <td className={`${tableCell} whitespace-nowrap`}>
        <ProgressLink href={row.href} className="font-mono text-xs text-brand-600 hover:underline">{row.code}</ProgressLink>
      </td>
      )}
      {isColumnVisible("name") && (
      <td className={`${tableCell} whitespace-nowrap`}>
        <ProgressLink href={row.href} className="hover:text-brand-600">{row.name}</ProgressLink>
      </td>
      )}
      {isColumnVisible("department") && <td className={`${tableCell} whitespace-nowrap`}>{department}</td>}
      {isColumnVisible("application") && <td className={`${tableCell} text-xs text-gray-600 max-w-[140px] truncate`}>{applications}</td>}
      {isColumnVisible("externalDependencies") && textCell(row.externalDependencies, true)}
      {isColumnVisible("releaseSize") && <td className={`${tableCell} whitespace-nowrap text-gray-600`}>{row.releaseSize ?? "—"}</td>}
      {isColumnVisible("impact") && <td className={`${tableCell} whitespace-nowrap`}>{impact}</td>}
      {isColumnVisible("priority") && <td className={`${tableCell} whitespace-nowrap`}>{priority}</td>}
      {isColumnVisible("cabDate") && <td className={`${tableCell} whitespace-nowrap text-gray-500`}>{row.cabDate ? formatDate(row.cabDate as string) : "—"}</td>}
      {isColumnVisible("startDate") && <td className={`${tableCell} whitespace-nowrap text-gray-500`}>{row.startDate ? formatDate(row.startDate as string) : "—"}</td>}
      {isColumnVisible("endDate") && <td className={`${tableCell} whitespace-nowrap text-gray-500`}>{formatDate(row.date)}</td>}
      {isColumnVisible("testEnvRequired") && <td className={`${tableCell} whitespace-nowrap text-gray-600`}>{row.testEnvRequired ?? "—"}</td>}
      {isColumnVisible("uatEnvRequired") && <td className={`${tableCell} whitespace-nowrap text-gray-600`}>{row.uatEnvRequired ?? "—"}</td>}
      {isColumnVisible("status") && <td className={`${tableCell} whitespace-nowrap`}><StatusBadge status={row.status as "Ready"} /></td>}
      {isColumnVisible("releaseHealth") && <td className={`${tableCell} whitespace-nowrap`}>{row.releaseHealth ?? "—"}</td>}
      {isColumnVisible("conflictFlag") && <td className={`${tableCell} whitespace-nowrap font-medium text-error-600`}>{row.conflictFlag ? "⚠️ CONFLICT" : "—"}</td>}
      {isColumnVisible("conflictId") && (
        <td className={`${tableCell} whitespace-nowrap`}>
          {conflictIds.length ? (
            <span className="font-mono text-xs">
              {conflictIds.map((conflictId, index) => (
                <span key={conflictId}>
                  {index > 0 && <span className="text-gray-400 dark:text-white/40">, </span>}
                  <ProgressLink
                    href={`/conflicts?conflictId=${encodeURIComponent(conflictId)}`}
                    className="text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {conflictId}
                  </ProgressLink>
                </span>
              ))}
            </span>
          ) : (
            "—"
          )}
        </td>
      )}
      {isColumnVisible("conflictingRelease") && textCell(row.conflictingRelease)}
      {isColumnVisible("conflictType") && textCell(row.conflictType, true)}
      {isColumnVisible("conflictNotes") && textCell(row.conflictNotes, true)}
      {isColumnVisible("blockers") && textCell(row.blockers, true)}
      {isColumnVisible("changeFreeze") && <td className={`${tableCell} whitespace-nowrap text-gray-600`}>{row.changeFreeze ?? "—"}</td>}
      {isColumnVisible("vendorMaintenance") && <td className={`${tableCell} whitespace-nowrap text-gray-600`}>{row.vendorMaintenance ?? "—"}</td>}
      {isColumnVisible("rollbackPlan") && textCell(row.rollbackPlan)}
      {isColumnVisible("readinessPercent") && <td className={`${tableCell} whitespace-nowrap font-medium`}>{row.readinessPercent !== null && row.readinessPercent !== undefined ? `${row.readinessPercent}%` : "—"}</td>}
      {isColumnVisible("goLiveChecklistPercent") && <td className={`${tableCell} whitespace-nowrap font-medium`}>{row.goLiveChecklistPercent !== null && row.goLiveChecklistPercent !== undefined ? `${row.goLiveChecklistPercent}%` : "—"}</td>}
      {isColumnVisible("releaseOwnerId") && <td className={`${tableCell} whitespace-nowrap text-gray-600 font-mono text-xs`}>{row.releaseOwnerId ?? "—"}</td>}
      {isColumnVisible("approvalStatus") && <td className={`${tableCell} whitespace-nowrap text-gray-600`}>{row.approvalStatus ?? "—"}</td>}
      {isColumnVisible("stakeholderIds") && <td className={`${tableCell} whitespace-nowrap text-xs text-gray-600 max-w-[140px] truncate font-mono`} title={row.stakeholderIds ?? ""}>{row.stakeholderIds ?? "—"}</td>}
      {isColumnVisible("dependsOn") && <td className={`${tableCell} whitespace-nowrap text-xs text-gray-600 font-mono`}>{dependsOn}</td>}
      {isColumnVisible("regulatory") && <td className={`${tableCell} whitespace-nowrap text-gray-600`}>{row.regulatory ?? "—"}</td>}
      {isColumnVisible("deploymentWindow") && <td className={`${tableCell} whitespace-nowrap text-gray-600`}>{row.deploymentWindow ?? "—"}</td>}
      {isColumnVisible("devSignoff") && <td className={`${tableCell} whitespace-nowrap text-gray-600`}>{row.devSignoff ?? "—"}</td>}
      {isColumnVisible("testSignoff") && <td className={`${tableCell} whitespace-nowrap text-gray-600`}>{row.testSignoff ?? "—"}</td>}
      {isColumnVisible("uatSignoff") && <td className={`${tableCell} whitespace-nowrap text-gray-600`}>{row.uatSignoff ?? "—"}</td>}
      {isColumnVisible("securityClearance") && <td className={`${tableCell} whitespace-nowrap text-gray-600`}>{row.securityClearance ?? "—"}</td>}
      {isColumnVisible("dressRehearsal") && <td className={`${tableCell} whitespace-nowrap text-gray-600`}>{row.dressRehearsal ?? "—"}</td>}
      {isColumnVisible("hypercarePlan") && <td className={`${tableCell} whitespace-nowrap text-gray-600`}>{row.hypercarePlan ?? "—"}</td>}
      {isColumnVisible("commsPlan") && <td className={`${tableCell} whitespace-nowrap text-gray-600`}>{row.commsPlan ?? "—"}</td>}
      {isColumnVisible("trainingStatus") && <td className={`${tableCell} whitespace-nowrap text-gray-600`}>{row.trainingStatus ?? "—"}</td>}
    </tr>
  );
}
