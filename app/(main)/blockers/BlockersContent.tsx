"use client";

import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import {
  FilterRangeInputs,
  FilterSelect,
  FilterTextInput,
  TableFilterBar,
} from "@/components/filters/TableFilterBar";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import {
  BLOCKER_COLUMNS,
  BLOCKER_DEFAULT_HIDDEN_FILTER_KEYS,
  BLOCKER_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { BLOCKER_SORT_PRESETS } from "@/lib/table-sort-presets";
import { DataTable, DataTableHeadRow, dataTableTableClass, tableCell, tableRow } from "@/components/ui/data-table";
import { cn, formatDate } from "@/lib/utils";
import { Ban } from "lucide-react";
import { useFilteredFetch } from "@/hooks/useTableFilters";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { BLOCKERS_FILTER_SCHEMA } from "@/lib/table-filters";
import { safeFetchJson } from "@/lib/safe-fetch";

type BlockerRow = {
  id: string;
  blockerCode: string;
  releaseCode: string;
  releaseName: string;
  releaseDbId: string | null;
  department: string;
  application: string;
  blockerType: string;
  blockerDescription: string;
  severity: string;
  raisedDate: string | null;
  raisedBy: string;
  assignedTo: string;
  status: string;
  targetResolutionDate: string | null;
  actualResolutionDate: string | null;
  daysOpen: number;
  escalationLevel: string;
  rootCause: string;
  resolutionNotes: string;
  impactOnRelease: string;
};

type BlockerColumnKey = (typeof BLOCKER_COLUMNS)[number]["key"];

const STATUS_OPTIONS = ["Open", "In Progress", "Resolved", "Closed"] as const;
const SEVERITY_OPTIONS = ["Critical", "High", "Medium", "Low"] as const;
const TYPE_OPTIONS = [
  "Business",
  "Compliance",
  "Defect",
  "Dependency",
  "Documentation",
  "Environment",
  "External",
  "Infrastructure",
  "Resource",
  "Security",
  "Technical",
  "Testing",
] as const;
const ESCALATION_OPTIONS = ["L1 - Team Lead", "L2 - Manager", "L3 - Director"] as const;

const SEVERITY_CLASSES: Record<string, string> = {
  Critical: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
  High: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  Medium: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
  Low: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white/70",
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

function renderBlockerCell(b: BlockerRow, key: BlockerColumnKey) {
  switch (key) {
    case "blockerCode":
      return (
        <td key={key} className={`${tableCell} font-mono text-xs font-semibold whitespace-nowrap`}>
          <ProgressLink href={`/blockers/${b.id}`} className="text-brand-600 hover:underline dark:text-brand-400">
            {b.blockerCode}
          </ProgressLink>
        </td>
      );
    case "releaseCode":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap`}>
          <ReleaseCode code={b.releaseCode} dbId={b.releaseDbId} />
        </td>
      );
    case "releaseName":
      return <td key={key} className={`${tableCell} text-gray-700 dark:text-white/80 whitespace-nowrap`}>{b.releaseName}</td>;
    case "department":
      return <td key={key} className={`${tableCell} text-gray-700 dark:text-white/80 whitespace-nowrap`}>{b.department}</td>;
    case "application":
      return <td key={key} className={`${tableCell} text-gray-700 dark:text-white/80 whitespace-nowrap`}>{b.application}</td>;
    case "blockerType":
      return <td key={key} className={`${tableCell} text-gray-700 dark:text-white/80 whitespace-nowrap`}>{b.blockerType}</td>;
    case "blockerDescription":
      return (
        <td key={key} className={`${tableCell} text-gray-600 dark:text-white/70 max-w-[280px] truncate`} title={b.blockerDescription}>
          {b.blockerDescription}
        </td>
      );
    case "severity":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap`}>
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-bold", SEVERITY_CLASSES[b.severity] ?? "")}>
            {b.severity}
          </span>
        </td>
      );
    case "raisedDate":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap text-gray-600 dark:text-white/70`}>
          {b.raisedDate ? formatDate(b.raisedDate) : "—"}
        </td>
      );
    case "raisedBy":
      return <td key={key} className={`${tableCell} text-gray-700 dark:text-white/80 whitespace-nowrap`}>{b.raisedBy}</td>;
    case "assignedTo":
      return <td key={key} className={`${tableCell} text-gray-700 dark:text-white/80 whitespace-nowrap`}>{b.assignedTo || "—"}</td>;
    case "status":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap`}>
          <StatusBadge status={b.status} />
        </td>
      );
    case "targetResolutionDate":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap text-gray-600 dark:text-white/70`}>
          {b.targetResolutionDate ? formatDate(b.targetResolutionDate) : "—"}
        </td>
      );
    case "actualResolutionDate":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap text-gray-600 dark:text-white/70`}>
          {b.actualResolutionDate ? formatDate(b.actualResolutionDate) : "—"}
        </td>
      );
    case "daysOpen":
      return <td key={key} className={`${tableCell} whitespace-nowrap font-mono text-xs text-gray-700 dark:text-white/80`}>{b.daysOpen}</td>;
    case "escalationLevel":
      return <td key={key} className={`${tableCell} text-gray-700 dark:text-white/80 whitespace-nowrap`}>{b.escalationLevel}</td>;
    case "rootCause":
      return (
        <td key={key} className={`${tableCell} text-gray-600 dark:text-white/70 max-w-[220px] truncate`} title={b.rootCause}>
          {b.rootCause || "—"}
        </td>
      );
    case "resolutionNotes":
      return (
        <td key={key} className={`${tableCell} text-gray-600 dark:text-white/70 max-w-[220px] truncate`} title={b.resolutionNotes}>
          {b.resolutionNotes || "—"}
        </td>
      );
    case "impactOnRelease":
      return (
        <td key={key} className={`${tableCell} text-gray-600 dark:text-white/70 max-w-[220px] truncate`} title={b.impactOnRelease}>
          {b.impactOnRelease}
        </td>
      );
    default:
      return null;
  }
}

export default function BlockersContent() {
  const {
    rows: blockers,
    loading,
    values,
    setFilter,
    setSort,
    clearAll,
    hasActive,
    sortKey,
    sortDir,
    toggleSort,
  } = useFilteredFetch<BlockerRow>("/api/blockers", BLOCKERS_FILTER_SCHEMA, {
    defaultSortKey: "blockerCode",
    defaultSortDir: "asc",
    sortAccessors: {
      blockerCode: (r) => r.blockerCode,
      releaseCode: (r) => r.releaseCode,
      releaseName: (r) => r.releaseName,
      department: (r) => r.department,
      application: (r) => r.application,
      blockerType: (r) => r.blockerType,
      blockerDescription: (r) => r.blockerDescription,
      severity: (r) => r.severity,
      raisedDate: (r) => r.raisedDate ?? "",
      raisedBy: (r) => r.raisedBy,
      assignedTo: (r) => r.assignedTo,
      status: (r) => r.status,
      targetResolutionDate: (r) => r.targetResolutionDate ?? "",
      actualResolutionDate: (r) => r.actualResolutionDate ?? "",
      daysOpen: (r) => r.daysOpen,
      escalationLevel: (r) => r.escalationLevel,
      rootCause: (r) => r.rootCause,
      resolutionNotes: (r) => r.resolutionNotes,
      impactOnRelease: (r) => r.impactOnRelease,
    },
  });

  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [apps, setApps] = useState<{ id: string; name: string; departmentId: string }[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const [deptRes, appsRes] = await Promise.all([
        safeFetchJson<{ id: string; name: string }[]>("/api/departments", { signal: ac.signal, label: "departments" }),
        safeFetchJson<{ id: string; name: string; departmentId: string }[]>("/api/applications", { signal: ac.signal, label: "applications" }),
      ]);
      if (ac.signal.aborted) return;
      if (deptRes.ok) setDepartments(deptRes.data);
      if (appsRes.ok) setApps(appsRes.data);
    })();
    return () => ac.abort();
  }, []);

  const appOptions = useMemo(
    () => (values.departmentId ? apps.filter((a) => a.departmentId === values.departmentId) : apps),
    [apps, values.departmentId]
  );

  const openCount = blockers.filter((b) => b.status === "Open" || b.status === "In Progress").length;

  const { visibleColumns, isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "blockers",
    BLOCKER_COLUMNS,
    BLOCKER_FILTER_FIELDS,
    {
      lockedKeys: ["blockerCode"],
      defaultHiddenFilters: BLOCKER_DEFAULT_HIDDEN_FILTER_KEYS,
    }
  );

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  return (
    <div>
      <TopBar
        pageKey="blockers"
        trailing={<PageDocumentation pageKey="blockers" />}
        title="Blockers"
        subtitle={
          blockers.length > 0
            ? `${blockers.length} blocker${blockers.length === 1 ? "" : "s"}${openCount > 0 ? ` · ${openCount} open or in progress` : ""}`
            : "No blockers recorded"
        }
      />

      {!tablePending && (
        <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
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
          {isFilterVisible("severity") && (
            <FilterSelect value={values.severity} onChange={(v) => setFilter("severity", v)}>
              <option value="">All severities</option>
              {SEVERITY_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("blockerType") && (
            <FilterSelect value={values.blockerType} onChange={(v) => setFilter("blockerType", v)}>
              <option value="">All types</option>
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </FilterSelect>
          )}
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
          {isFilterVisible("assignedToQ") && (
            <FilterTextInput
              value={values.assignedToQ}
              onChange={(v) => setFilter("assignedToQ", v)}
              placeholder="Assigned to…"
            />
          )}
          {isFilterVisible("releaseCodeQ") && (
            <FilterTextInput
              value={values.releaseCodeQ}
              onChange={(v) => setFilter("releaseCodeQ", v)}
              placeholder="Release ID…"
            />
          )}
          {isFilterVisible("blockerCodeQ") && (
            <FilterTextInput
              value={values.blockerCodeQ}
              onChange={(v) => setFilter("blockerCodeQ", v)}
              placeholder="Blocker ID…"
            />
          )}
          {isFilterVisible("releaseNameQ") && (
            <FilterTextInput
              value={values.releaseNameQ}
              onChange={(v) => setFilter("releaseNameQ", v)}
              placeholder="Release name…"
            />
          )}
          {isFilterVisible("blockerDescriptionQ") && (
            <FilterTextInput
              value={values.blockerDescriptionQ}
              onChange={(v) => setFilter("blockerDescriptionQ", v)}
              placeholder="Description…"
            />
          )}
          {isFilterVisible("raisedDateQ") && (
            <FilterTextInput
              value={values.raisedDateQ}
              onChange={(v) => setFilter("raisedDateQ", v)}
              placeholder="Raised (YYYY-MM-DD)…"
            />
          )}
          {isFilterVisible("raisedByQ") && (
            <FilterTextInput
              value={values.raisedByQ}
              onChange={(v) => setFilter("raisedByQ", v)}
              placeholder="Raised by…"
            />
          )}
          {isFilterVisible("targetResolutionDateQ") && (
            <FilterTextInput
              value={values.targetResolutionDateQ}
              onChange={(v) => setFilter("targetResolutionDateQ", v)}
              placeholder="Target resolution…"
            />
          )}
          {isFilterVisible("actualResolutionDateQ") && (
            <FilterTextInput
              value={values.actualResolutionDateQ}
              onChange={(v) => setFilter("actualResolutionDateQ", v)}
              placeholder="Actual resolution…"
            />
          )}
          {isFilterVisible("daysOpen") && (
            <div className="inline-flex items-center gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Days open</span>
              <FilterRangeInputs
                minValue={values.daysOpenMin}
                maxValue={values.daysOpenMax}
                onMinChange={(v) => setFilter("daysOpenMin", v)}
                onMaxChange={(v) => setFilter("daysOpenMax", v)}
              />
            </div>
          )}
          {isFilterVisible("escalationLevel") && (
            <FilterSelect value={values.escalationLevel} onChange={(v) => setFilter("escalationLevel", v)}>
              <option value="">All escalations</option>
              {ESCALATION_OPTIONS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("rootCauseQ") && (
            <FilterTextInput
              value={values.rootCauseQ}
              onChange={(v) => setFilter("rootCauseQ", v)}
              placeholder="Root cause…"
            />
          )}
          {isFilterVisible("resolutionNotesQ") && (
            <FilterTextInput
              value={values.resolutionNotesQ}
              onChange={(v) => setFilter("resolutionNotesQ", v)}
              placeholder="Resolution notes…"
            />
          )}
          {isFilterVisible("impactOnReleaseQ") && (
            <FilterTextInput
              value={values.impactOnReleaseQ}
              onChange={(v) => setFilter("impactOnReleaseQ", v)}
              placeholder="Impact on release…"
            />
          )}
        </TableFilterBar>
      )}

      {tablePending ? (
        <TableSkeleton showTitle={false} columns={BLOCKER_COLUMNS.length} />
      ) : (
        <DataTable
          title="All Blockers"
          icon={Ban}
          toolbar={
            <TablePageToolbar
              columnPicker={columnPicker}
              presets={BLOCKER_SORT_PRESETS}
              sortKey={sortKey}
              sortDir={sortDir}
              onSelectSort={setSort}
            />
          }
        >
          <table className={dataTableTableClass}>
            <thead>
              <DataTableHeadRow
                columns={BLOCKER_COLUMNS}
                isColumnVisible={isColumnVisible}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
            </thead>
            <tbody>
              {blockers.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="p-4 text-center text-gray-500">
                    {hasActive ? "No blockers match the selected filters." : "No blockers recorded."}
                  </td>
                </tr>
              ) : (
                blockers.map((b) => (
                  <tr key={b.id} className={tableRow}>
                    {visibleColumns.map((col) => renderBlockerCell(b, col.key as BlockerColumnKey))}
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
