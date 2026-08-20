"use client";

import { useEffect, useMemo, useState } from "react";
import { Stamp } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { SIGNOFF_SORT_PRESETS } from "@/lib/table-sort-presets";
import { DataTable, DataTableHeadRow, dataTableTableClass, tableCell, tableRow } from "@/components/ui/data-table";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import {
  SIGNOFF_COLUMNS,
  SIGNOFF_DEFAULT_HIDDEN_COLUMN_KEYS,
  SIGNOFFS_DEFAULT_HIDDEN_FILTER_KEYS,
  SIGNOFFS_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { useFilteredFetch } from "@/hooks/useTableFilters";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { SIGNOFFS_FILTER_SCHEMA } from "@/lib/table-filters";
import { safeFetchJson } from "@/lib/safe-fetch";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { useVoiceListContext } from "@/hooks/useVoiceListContext";
import { useEntityLifecycleStatuses } from "@/hooks/useEntityLifecycleStatuses";
import type { SignoffListRow } from "@/lib/signoff-list";

type SignoffColumnKey = (typeof SIGNOFF_COLUMNS)[number]["key"];

function renderSignoffCell(row: SignoffListRow, key: SignoffColumnKey) {
  switch (key) {
    case "signoffCode":
      return (
        <td key={key} className={`${tableCell} font-mono text-xs font-semibold whitespace-nowrap`}>
          <ProgressLink
            href={`/signoffs/${encodeURIComponent(row.id)}`}
            data-voice-row={row.signoffCode}
            className="text-brand-600 hover:underline dark:text-brand-400"
          >
            {row.signoffCode}
          </ProgressLink>
        </td>
      );
    case "typeLabel":
      return <td key={key} className={`${tableCell} whitespace-nowrap`}>{row.typeLabel}</td>;
    case "status":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap`}>
          <StatusBadge status={row.status} />
        </td>
      );
    case "required":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap text-gray-600 dark:text-white/70`}>
          {row.mandatory ? "Required" : "Optional"}
        </td>
      );
    case "releaseCode":
      return (
        <td key={key} className={`${tableCell} whitespace-nowrap`}>
          <ProgressLink
            href={`/releases/${row.releaseId}`}
            className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
          >
            {row.releaseCode}
          </ProgressLink>
        </td>
      );
    case "releaseName":
      return <td key={key} className={`${tableCell} whitespace-nowrap`}>{row.releaseName}</td>;
    case "releaseStatus":
      return <td key={key} className={`${tableCell} whitespace-nowrap`}>{row.releaseStatus}</td>;
    case "application":
      return <td key={key} className={`${tableCell} whitespace-nowrap`}>{row.application}</td>;
    case "department":
      return <td key={key} className={`${tableCell} whitespace-nowrap`}>{row.department}</td>;
    case "owner":
      return <td key={key} className={`${tableCell} whitespace-nowrap`}>{row.owner}</td>;
    default:
      return null;
  }
}

export default function SignoffsContent() {
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
  } = useFilteredFetch<SignoffListRow>("/api/signoffs", SIGNOFFS_FILTER_SCHEMA, {
    defaultSortKey: "signoffCode",
    defaultSortDir: "asc",
    sortAccessors: {
      signoffCode: (r) => r.signoffCode,
      typeLabel: (r) => r.typeLabel,
      status: (r) => r.status,
      required: (r) => (r.mandatory ? 1 : 0),
      releaseCode: (r) => r.releaseCode,
      releaseName: (r) => r.releaseName,
      releaseStatus: (r) => r.releaseStatus,
      application: (r) => r.application,
      department: (r) => r.department,
      owner: (r) => r.owner,
    },
  });
  const [allRows, setAllRows] = useState<SignoffListRow[]>([]);
  const lifecycle = useEntityLifecycleStatuses("/api/signoff-lifecycle-config");
  const statusOptions = useMemo(
    () => lifecycle.filterOptions(allRows.map((row) => row.status)),
    [lifecycle, allRows]
  );

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<SignoffListRow[]>("/api/signoffs", {
        signal: ac.signal,
        label: "signoffs",
      });
      if (ac.signal.aborted) return;
      if (result.ok) setAllRows(result.data);
    })();
    return () => ac.abort();
  }, []);

  const types = useMemo(
    () => [...new Set(allRows.map((row) => row.typeLabel))].sort(),
    [allRows]
  );

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "signoffs",
    SIGNOFF_COLUMNS,
    SIGNOFFS_FILTER_FIELDS,
    {
      lockedKeys: ["signoffCode"],
      defaultHiddenFilters: SIGNOFFS_DEFAULT_HIDDEN_FILTER_KEYS,
      defaultHiddenColumns: SIGNOFF_DEFAULT_HIDDEN_COLUMN_KEYS,
    }
  );

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  const voiceVisibleRows = useMemo(
    () =>
      rows.map((row) => ({
        code: row.signoffCode,
        label: `${row.signoffCode} — ${row.typeLabel}`,
        path: `/signoffs/${encodeURIComponent(row.id)}`,
      })),
    [rows]
  );
  useVoiceListContext("/signoffs", null, voiceVisibleRows, hasActive ? "filtered" : undefined);

  return (
    <div>
      <TopBar
        pageKey="signoffs"
        trailing={<PageDocumentation pageKey="signoffs" />}
        title="Sign-offs"
        subtitle={`${rows.length} checklist item${rows.length === 1 ? "" : "s"} across releases`}
      />
      {!tablePending && (
        <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
          {isFilterVisible("status") && (
            <FilterSelect value={values.status} onChange={(v) => setFilter("status", v)}>
              <option value="">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("signoffType") && (
            <FilterSelect value={values.signoffType} onChange={(v) => setFilter("signoffType", v)}>
              <option value="">All types</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("required") && (
            <FilterSelect value={values.required} onChange={(v) => setFilter("required", v)}>
              <option value="">Required or optional</option>
              <option value="required">Required</option>
              <option value="optional">Optional</option>
            </FilterSelect>
          )}
          {isFilterVisible("releaseCodeQ") && (
            <FilterTextInput
              value={values.releaseCodeQ}
              onChange={(v) => setFilter("releaseCodeQ", v)}
              placeholder="Release ID…"
            />
          )}
          {isFilterVisible("releaseNameQ") && (
            <FilterTextInput
              value={values.releaseNameQ}
              onChange={(v) => setFilter("releaseNameQ", v)}
              placeholder="Release name…"
            />
          )}
          {isFilterVisible("signoffCodeQ") && (
            <FilterTextInput
              value={values.signoffCodeQ}
              onChange={(v) => setFilter("signoffCodeQ", v)}
              placeholder="Sign-off ID…"
            />
          )}
          {isFilterVisible("applicationQ") && (
            <FilterTextInput
              value={values.applicationQ}
              onChange={(v) => setFilter("applicationQ", v)}
              placeholder="Application…"
            />
          )}
          {isFilterVisible("departmentQ") && (
            <FilterTextInput
              value={values.departmentQ}
              onChange={(v) => setFilter("departmentQ", v)}
              placeholder="Department…"
            />
          )}
          {isFilterVisible("ownerQ") && (
            <FilterTextInput
              value={values.ownerQ}
              onChange={(v) => setFilter("ownerQ", v)}
              placeholder="Owner…"
            />
          )}
        </TableFilterBar>
      )}

      {tablePending ? (
        <TableSkeleton columns={SIGNOFF_COLUMNS.length} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-900">
          <Stamp className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400">
            {hasActive ? "No sign-offs match the selected filters." : "No sign-off types are enabled."}
          </p>
        </div>
      ) : (
        <DataTable
          title="All Sign-offs"
          icon={Stamp}
          toolbar={
            <TablePageToolbar
              columnPicker={columnPicker}
              presets={SIGNOFF_SORT_PRESETS}
              sortKey={sortKey}
              sortDir={sortDir}
              onSelectSort={setSort}
            />
          }
        >
          <div className="overflow-x-auto">
            <table className={dataTableTableClass}>
              <thead>
                <DataTableHeadRow
                  columns={SIGNOFF_COLUMNS}
                  isColumnVisible={isColumnVisible}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={tableRow}>
                    {SIGNOFF_COLUMNS.map((col) =>
                      isColumnVisible(col.key) ? renderSignoffCell(row, col.key as SignoffColumnKey) : null
                    )}
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
