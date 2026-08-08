"use client";

import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import {
  CONFLICT_COLUMNS,
  CONFLICT_DEFAULT_HIDDEN_COLUMN_KEYS,
  CONFLICT_DEFAULT_HIDDEN_FILTER_KEYS,
  CONFLICT_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { CONFLICT_SORT_PRESETS } from "@/lib/table-sort-presets";
import { DataTable, DataTableHeadRow, dataTableTableClass, tableCell, tableRow } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import { AlertOctagon, Plus } from "lucide-react";
import { useFilteredFetch } from "@/hooks/useTableFilters";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { CONFLICTS_FILTER_SCHEMA } from "@/lib/table-filters";
import { loadJsonEffect } from "@/lib/safe-fetch";
import { ConflictFormModal } from "@/components/conflicts/ConflictFormModal";
import { canEdit as sessionCanEdit, type SessionUser } from "@/lib/auth/roles";
import { taBtnPrimary } from "@/lib/styles";
import { useVoiceListContext } from "@/hooks/useVoiceListContext";

type ConflictRow = {
  id: string;
  conflictCode: string;
  status: string;
  priority: string;
  assignedTo: string;
  release1Code: string;
  release2Code: string;
  release1DbId: string | null;
  release2DbId: string | null;
  application: string;
  department: string;
  conflictingEnvironment: string;
  environmentConflictType: string;
  notes: string | null;
};

const STATUS_OPTIONS = [
  "Detected",
  "Under Review",
  "Resolved",
  "Dismissed",
] as const;
const PRIORITY_OPTIONS = ["P1 - Critical", "P2 - High", "P3 - Medium"] as const;

type ConflictColumnKey = (typeof CONFLICT_COLUMNS)[number]["key"];

const PRIORITY_CLASSES: Record<string, string> = {
  "P1 - Critical": "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
  "P2 - High": "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  "P3 - Medium": "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
};

function ReleaseCode({ code, dbId }: { code: string; dbId: string | null }) {
  if (dbId) {
    return (
      <ProgressLink href={`/releases/${dbId}`} className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400">
        {code}
      </ProgressLink>
    );
  }
  return <span className="font-mono text-xs text-gray-800 dark:text-white/80">{code}</span>;
}

function renderConflictCell(c: ConflictRow, key: ConflictColumnKey) {
  switch (key) {
    case "conflictCode":
      return (
        <td key={key} className={`${tableCell} font-mono text-xs font-semibold whitespace-nowrap`}>
          <ProgressLink href={`/conflicts/${c.id}`} data-voice-row={c.conflictCode} className="text-brand-600 hover:underline dark:text-brand-400">
            {c.conflictCode}
          </ProgressLink>
        </td>
      );
    case "status":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap`}>
          <StatusBadge status={c.status} />
        </td>
      );
    case "priority":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap`}>
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-bold", PRIORITY_CLASSES[c.priority] ?? "")}>
            {c.priority}
          </span>
        </td>
      );
    case "assignedTo":
      return <td key={key} className={`${tableCell} text-gray-700 dark:text-white/80 whitespace-nowrap`}>{c.assignedTo}</td>;
    case "release1Code":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap`}>
          <ReleaseCode code={c.release1Code} dbId={c.release1DbId} />
        </td>
      );
    case "release2Code":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap`}>
          <ReleaseCode code={c.release2Code} dbId={c.release2DbId} />
        </td>
      );
    case "application":
      return <td key={key} className={`${tableCell} text-gray-700 dark:text-white/80 whitespace-nowrap`}>{c.application}</td>;
    case "department":
      return <td key={key} className={`${tableCell} text-gray-700 dark:text-white/80 whitespace-nowrap`}>{c.department}</td>;
    case "conflictingEnvironment":
      return <td key={key} className={`${tableCell} text-gray-600 dark:text-white/70 whitespace-nowrap`}>{c.conflictingEnvironment}</td>;
    case "environmentConflictType":
      return <td key={key} className={`${tableCell} text-gray-600 dark:text-white/70 whitespace-nowrap`}>{c.environmentConflictType}</td>;
    case "notes":
      return (
        <td key={key} className={`${tableCell} text-gray-600 dark:text-white/70 max-w-[280px] truncate`} title={c.notes ?? ""}>
          {c.notes ?? "—"}
        </td>
      );
    default:
      return null;
  }
}

export default function ConflictQueueContent() {
  const {
    rows: conflicts,
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
  } = useFilteredFetch<ConflictRow>("/api/conflicts", CONFLICTS_FILTER_SCHEMA, {
    defaultSortKey: "conflictCode",
    defaultSortDir: "asc",
    sortAccessors: {
      conflictCode: (r) => r.conflictCode,
      status: (r) => r.status,
      priority: (r) => r.priority,
      assignedTo: (r) => r.assignedTo,
      release1Code: (r) => r.release1Code,
      release2Code: (r) => r.release2Code,
      application: (r) => r.application,
      department: (r) => r.department,
      conflictingEnvironment: (r) => r.conflictingEnvironment,
      environmentConflictType: (r) => r.environmentConflictType,
      notes: (r) => r.notes ?? "",
    },
  });
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [apps, setApps] = useState<{ id: string; name: string; departmentId: string }[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const canEdit = sessionCanEdit(user);

  const voiceVisibleRows = useMemo(
    () =>
      conflicts.map((c) => ({
        code: c.conflictCode,
        label: `${c.conflictCode} — ${c.release1Code}/${c.release2Code}`,
        path: `/conflicts/${c.id}`,
      })),
    [conflicts]
  );
  useVoiceListContext(
    "/conflicts",
    "conflict",
    voiceVisibleRows,
    hasActive ? "filtered" : undefined
  );

  useEffect(() => {
    return loadJsonEffect<{ id: string; name: string }[]>("/api/departments", setDepartments, { label: "departments" });
  }, []);

  useEffect(() => {
    return loadJsonEffect<{ id: string; name: string; departmentId: string }[]>("/api/applications", setApps, {
      label: "applications",
    });
  }, []);

  useEffect(() => {
    return loadJsonEffect<{ user: SessionUser }>("/api/auth/me", (data) => setUser(data.user), {
      label: "conflicts-auth",
    });
  }, []);

  const appOptions = useMemo(
    () => (values.departmentId ? apps.filter((a) => a.departmentId === values.departmentId) : apps),
    [apps, values.departmentId]
  );

  const openCount = conflicts.filter(
    (c) =>
      c.status === "Detected" ||
      c.status === "Under Review" ||
      c.status === "Open" ||
      c.status === "Escalated" ||
      c.status === "In Progress" ||
      c.status === "Pending Review"
  ).length;

  const conflictTypes = useMemo(
    () => [...new Set(conflicts.map((c) => c.environmentConflictType).filter(Boolean))].sort(),
    [conflicts]
  );

  const { visibleColumns, isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "conflicts",
    CONFLICT_COLUMNS,
    CONFLICT_FILTER_FIELDS,
    {
      lockedKeys: ["conflictCode"],
      defaultHiddenFilters: CONFLICT_DEFAULT_HIDDEN_FILTER_KEYS,
      defaultHiddenColumns: CONFLICT_DEFAULT_HIDDEN_COLUMN_KEYS,
    }
  );

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  return (
    <div>
      <TopBar
        pageKey="conflicts"
        trailing={
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <button type="button" className={cn(taBtnPrimary, "text-sm")} onClick={() => setModalOpen(true)}>
                <Plus className="mr-1 inline h-4 w-4" /> New Conflict
              </button>
            ) : null}
            <PageDocumentation pageKey="conflicts" />
          </div>
        }
        title="Conflict Resolution Queue"
        subtitle={
          conflicts.length > 0
            ? `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"}${openCount > 0 ? ` · ${openCount} open or escalated` : ""}`
            : "No active conflicts detected"
        }
      />
      <ConflictFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={refetch}
        conflictTypeOptions={conflictTypes}
      />

      {!tablePending && (
        <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
          {isFilterVisible("departmentId") && (
            <FilterSelect value={values.departmentId} onChange={(v) => setFilter("departmentId", v)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("applicationId") && (
            <FilterSelect value={values.applicationId} onChange={(v) => setFilter("applicationId", v)}>
              <option value="">All applications</option>
              {appOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("status") && (
            <FilterSelect value={values.status} onChange={(v) => setFilter("status", v)}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("priority") && (
            <FilterSelect value={values.priority} onChange={(v) => setFilter("priority", v)}>
              <option value="">All priorities</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
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
          {isFilterVisible("conflictCodeQ") && (
            <FilterTextInput
              value={values.conflictCodeQ}
              onChange={(v) => setFilter("conflictCodeQ", v)}
              placeholder="Conflict ID…"
            />
          )}
          {isFilterVisible("release1CodeQ") && (
            <FilterTextInput
              value={values.release1CodeQ}
              onChange={(v) => setFilter("release1CodeQ", v)}
              placeholder="Release 1…"
            />
          )}
          {isFilterVisible("release2CodeQ") && (
            <FilterTextInput
              value={values.release2CodeQ}
              onChange={(v) => setFilter("release2CodeQ", v)}
              placeholder="Release 2…"
            />
          )}
          {isFilterVisible("conflictingEnvironmentQ") && (
            <FilterTextInput
              value={values.conflictingEnvironmentQ}
              onChange={(v) => setFilter("conflictingEnvironmentQ", v)}
              placeholder="Conflicting env…"
            />
          )}
          {isFilterVisible("environmentConflictType") && (
            <FilterSelect
              value={values.environmentConflictType}
              onChange={(v) => setFilter("environmentConflictType", v)}
            >
              <option value="">All conflict types</option>
              {conflictTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </FilterSelect>
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
        <TableSkeleton showTitle={false} columns={CONFLICT_COLUMNS.length} />
      ) : (
        <DataTable
          title="All Conflicts"
          icon={AlertOctagon}
          toolbar={
            <TablePageToolbar
              columnPicker={columnPicker}
              presets={CONFLICT_SORT_PRESETS}
              sortKey={sortKey}
              sortDir={sortDir}
              onSelectSort={setSort}
            />
          }
        >
          <table className={dataTableTableClass}>
            <thead>
              <DataTableHeadRow
                columns={CONFLICT_COLUMNS}
                isColumnVisible={isColumnVisible}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
            </thead>
            <tbody>
              {conflicts.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="p-4 text-center text-gray-500">
                    {hasActive ? "No conflicts match the selected filters." : "No conflicts recorded."}
                  </td>
                </tr>
              ) : (
                conflicts.map((c) => (
                  <tr key={c.id} className={tableRow}>
                    {visibleColumns.map((col) => renderConflictCell(c, col.key as ConflictColumnKey))}
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
