"use client";

import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { FilterPills, FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import {
  DEPENDENCY_COLUMNS,
  DEPENDENCY_DEFAULT_HIDDEN_COLUMN_KEYS,
  DEPENDENCY_DEFAULT_HIDDEN_FILTER_KEYS,
  DEPENDENCY_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { DEPENDENCY_SORT_PRESETS } from "@/lib/table-sort-presets";
import { DataTable, DataTableHeadRow, dataTableTableClass, tableCell, tableRow } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import { Network, Plus } from "lucide-react";
import { useFilteredFetch } from "@/hooks/useTableFilters";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { DEPENDENCIES_FILTER_SCHEMA } from "@/lib/table-filters";
import { DependencyFormModal } from "@/components/dependencies/DependencyFormModal";
import { canEdit as sessionCanEdit, type SessionUser } from "@/lib/auth/roles";
import { loadJsonEffect } from "@/lib/safe-fetch";
import { taBtnPrimary } from "@/lib/styles";
import { DEPENDENCY_IMPACTS } from "@/lib/validation/dependency";
import { useVoiceListContext } from "@/hooks/useVoiceListContext";
import { useEntityLifecycleStatuses } from "@/hooks/useEntityLifecycleStatuses";

type DepRow = {
  id: string;
  depCode: string;
  releaseCode: string;
  releaseName: string;
  releaseDbId: string | null;
  dependsOnCode: string;
  dependsOnName: string;
  dependsOnDbId: string | null;
  dependencyType: string;
  status: string;
  impactIfBlocked: string;
  notes: string | null;
};

type DepColumnKey = (typeof DEPENDENCY_COLUMNS)[number]["key"];

const TYPE_CLASSES: Record<string, string> = {
  Hard: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
  Soft: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",
  Technical: "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300",
  Data: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  Integration: "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300",
};

const IMPACT_OPTIONS = DEPENDENCY_IMPACTS;

function ReleaseLink({ code, dbId, name }: { code: string; dbId: string | null; name?: string }) {
  if (dbId) {
    return (
      <div>
        <ProgressLink href={`/releases/${dbId}`} className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400">
          {code}
        </ProgressLink>
        {name ? <div className="text-xs text-gray-500 dark:text-white/50">{name}</div> : null}
      </div>
    );
  }
  return (
    <div>
      <span className="font-mono text-xs text-gray-800 dark:text-white/80">{code}</span>
      {name ? <div className="text-xs text-gray-500 dark:text-white/50">{name}</div> : null}
    </div>
  );
}

function renderDepCell(d: DepRow, key: DepColumnKey) {
  switch (key) {
    case "depCode":
      return (
        <td key={key} className={`${tableCell} font-mono text-xs whitespace-nowrap`}>
          {d.depCode ? (
            <ProgressLink href={`/dependencies/${d.id}`} data-voice-row={d.depCode} className="text-brand-600 hover:underline dark:text-brand-400">
              {d.depCode}
            </ProgressLink>
          ) : (
            <span className="text-gray-400 dark:text-white/40">—</span>
          )}
        </td>
      );
    case "releaseCode":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap`}>
          <ReleaseLink code={d.releaseCode} dbId={d.releaseDbId} />
        </td>
      );
    case "releaseName":
      return <td key={key} className={`${tableCell} text-gray-700 dark:text-white/80 whitespace-nowrap`}>{d.releaseName}</td>;
    case "dependsOnCode":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap`}>
          <ReleaseLink code={d.dependsOnCode} dbId={d.dependsOnDbId} />
        </td>
      );
    case "dependsOnName":
      return <td key={key} className={`${tableCell} text-gray-700 dark:text-white/80 whitespace-nowrap`}>{d.dependsOnName}</td>;
    case "dependencyType":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap`}>
          {d.dependencyType ? (
            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-bold", TYPE_CLASSES[d.dependencyType] ?? "")}>
              {d.dependencyType}
            </span>
          ) : (
            <span className="text-gray-400 dark:text-white/40">—</span>
          )}
        </td>
      );
    case "status":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap`}>
          {d.status ? <StatusBadge status={d.status} /> : <span className="text-gray-400 dark:text-white/40">—</span>}
        </td>
      );
    case "impactIfBlocked":
      return <td key={key} className={`${tableCell} text-gray-700 dark:text-white/80 whitespace-nowrap`}>{d.impactIfBlocked}</td>;
    case "notes":
      return (
        <td key={key} className={`${tableCell} text-gray-600 dark:text-white/70 max-w-[280px] truncate`} title={d.notes ?? ""}>
          {d.notes ?? "—"}
        </td>
      );
    default:
      return null;
  }
}

export default function DependencyListContent() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const canEdit = sessionCanEdit(user);
  const [modalOpen, setModalOpen] = useState(false);
  const lifecycle = useEntityLifecycleStatuses("/api/dependency-lifecycle-config");

  const {
    rows: deps,
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
  } = useFilteredFetch<DepRow>("/api/dependencies", DEPENDENCIES_FILTER_SCHEMA, {
    defaultSortKey: "depCode",
    defaultSortDir: "asc",
    sortAccessors: {
      depCode: (r) => r.depCode,
      releaseCode: (r) => r.releaseCode,
      releaseName: (r) => r.releaseName,
      dependsOnCode: (r) => r.dependsOnCode,
      dependsOnName: (r) => r.dependsOnName,
      dependencyType: (r) => r.dependencyType,
      status: (r) => r.status,
      impactIfBlocked: (r) => r.impactIfBlocked,
      notes: (r) => r.notes ?? "",
    },
  });

  const statusOptions = useMemo(
    () => lifecycle.filterOptions(deps.map((d) => d.status)),
    [lifecycle, deps]
  );
  const openLabelSet = useMemo(
    () => new Set(lifecycle.openLabels.map((l) => l.toLocaleLowerCase())),
    [lifecycle.openLabels]
  );

  useEffect(() => {
    return loadJsonEffect<{ user: SessionUser }>("/api/auth/me", (data) => setUser(data.user), {
      label: "dependencies-auth",
    });
  }, []);

  const { visibleColumns, isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "dependencies",
    DEPENDENCY_COLUMNS,
    DEPENDENCY_FILTER_FIELDS,
    {
      lockedKeys: ["depCode"],
      defaultHiddenFilters: DEPENDENCY_DEFAULT_HIDDEN_FILTER_KEYS,
      defaultHiddenColumns: DEPENDENCY_DEFAULT_HIDDEN_COLUMN_KEYS,
    }
  );

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  const types = useMemo(
    () => [...new Set(deps.map((d) => d.dependencyType).filter(Boolean))].sort(),
    [deps]
  );
  const blockedCount = deps.filter((d) =>
    openLabelSet.has(d.status.toLocaleLowerCase())
  ).length;

  const voiceVisibleRows = useMemo(
    () =>
      deps.map((d) => ({
        code: d.depCode,
        label: `${d.depCode} — ${d.releaseCode}`,
        path: `/dependencies/${d.id}`,
      })),
    [deps]
  );
  useVoiceListContext(
    "/dependencies",
    "dependency",
    voiceVisibleRows,
    hasActive ? "filtered" : undefined
  );

  return (
    <div>
      <TopBar
        pageKey="dependencies"
        trailing={
          <div className="flex items-center gap-2">
            {canEdit ? (
              <button
                type="button"
                className={cn(taBtnPrimary, "text-sm")}
                onClick={() => setModalOpen(true)}
              >
                <Plus className="mr-1 inline h-4 w-4" /> New Dependency
              </button>
            ) : null}
            <PageDocumentation pageKey="dependencies" />
          </div>
        }
        title="Release Dependencies"
        subtitle={`${deps.length} dependencies${blockedCount > 0 ? ` · ${blockedCount} blocked or at risk` : ""}`}
      />
      <DependencyFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => refetch()}
        statusOptions={lifecycle.createOptions}
        defaultStatus={lifecycle.defaultStatus || "Identified"}
      />
      {!tablePending && (
        <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
          {isFilterVisible("status") && (
            <FilterPills
              options={statusOptions.map((s) => ({ value: s, label: s }))}
              value={values.status || ""}
              onChange={(v) => setFilter("status", v)}
            />
          )}
          {isFilterVisible("dependencyType") && (
            <FilterSelect value={values.dependencyType} onChange={(v) => setFilter("dependencyType", v)}>
              <option value="">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("impact") && (
            <FilterSelect value={values.impact} onChange={(v) => setFilter("impact", v)}>
              <option value="">All impacts</option>
              {IMPACT_OPTIONS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("releaseCodeQ") && (
            <FilterTextInput
              value={values.releaseCodeQ}
              onChange={(v) => setFilter("releaseCodeQ", v)}
              placeholder="Release ID…"
            />
          )}
          {isFilterVisible("dependsOnCodeQ") && (
            <FilterTextInput
              value={values.dependsOnCodeQ}
              onChange={(v) => setFilter("dependsOnCodeQ", v)}
              placeholder="Depends on release…"
            />
          )}
          {isFilterVisible("depCodeQ") && (
            <FilterTextInput
              value={values.depCodeQ}
              onChange={(v) => setFilter("depCodeQ", v)}
              placeholder="Dep ID…"
            />
          )}
          {isFilterVisible("releaseNameQ") && (
            <FilterTextInput
              value={values.releaseNameQ}
              onChange={(v) => setFilter("releaseNameQ", v)}
              placeholder="Release name…"
            />
          )}
          {isFilterVisible("dependsOnNameQ") && (
            <FilterTextInput
              value={values.dependsOnNameQ}
              onChange={(v) => setFilter("dependsOnNameQ", v)}
              placeholder="Depends on name…"
            />
          )}
          {isFilterVisible("notesQ") && (
            <FilterTextInput
              value={values.notesQ}
              onChange={(v) => setFilter("notesQ", v)}
              placeholder="Notes…"
            />
          )}
        </TableFilterBar>
      )}
      {tablePending ? (
        <TableSkeleton showTitle={false} columns={DEPENDENCY_COLUMNS.length} />
      ) : (
        <DataTable
          title="All Dependencies"
          icon={Network}
          toolbar={
            <TablePageToolbar
              columnPicker={columnPicker}
              presets={DEPENDENCY_SORT_PRESETS}
              sortKey={sortKey}
              sortDir={sortDir}
              onSelectSort={setSort}
            />
          }
        >
          <table className={dataTableTableClass}>
            <thead>
              <DataTableHeadRow
                columns={DEPENDENCY_COLUMNS}
                isColumnVisible={isColumnVisible}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
            </thead>
            <tbody>
              {deps.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="p-4 text-center text-gray-500">
                    {hasActive ? "No dependencies match the selected filters." : "No dependencies recorded."}
                  </td>
                </tr>
              ) : (
                deps.map((d) => (
                  <tr key={d.id} className={tableRow}>
                    {visibleColumns.map((col) => renderDepCell(d, col.key as DepColumnKey))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DataTable>
      )}
    </div>
  );
}
