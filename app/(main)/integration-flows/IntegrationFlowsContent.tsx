"use client";

import { useEffect, useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import {
  INTEGRATION_FLOW_COLUMNS,
  INTEGRATION_FLOW_DEFAULT_HIDDEN_COLUMN_KEYS,
  INTEGRATION_FLOW_DEFAULT_HIDDEN_FILTER_KEYS,
  INTEGRATION_FLOW_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { INTEGRATION_FLOW_SORT_PRESETS } from "@/lib/table-sort-presets";
import { DataTable, DataTableHeadRow, dataTableTableClass, tableCell, tableRow } from "@/components/ui/data-table";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useFilteredFetch } from "@/hooks/useTableFilters";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { safeFetchJson } from "@/lib/safe-fetch";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { INTEGRATION_FLOWS_FILTER_SCHEMA } from "@/lib/table-filters";

type IntegrationFlowRow = {
  id: string;
  flowCode: string;
  sourceSystem: string;
  targetSystem: string;
  integrationType: string;
  frequency: string;
  dataElements: string;
  businessPurpose: string;
};

export default function IntegrationFlowsContent() {
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
  } = useFilteredFetch<IntegrationFlowRow>("/api/integration-flows", INTEGRATION_FLOWS_FILTER_SCHEMA, {
    defaultSortKey: "flowCode",
    defaultSortDir: "asc",
    sortAccessors: {
      flowCode: (r) => r.flowCode,
      sourceSystem: (r) => r.sourceSystem,
      targetSystem: (r) => r.targetSystem,
      integrationType: (r) => r.integrationType,
      frequency: (r) => r.frequency,
      dataElements: (r) => r.dataElements,
      businessPurpose: (r) => r.businessPurpose,
    },
  });

  const [allRows, setAllRows] = useState<IntegrationFlowRow[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      const res = await safeFetchJson<IntegrationFlowRow[]>("/api/integration-flows", {
        signal: ac.signal,
        label: "integration-flows",
      });
      if (ac.signal.aborted) return;
      if (res.ok) setAllRows(res.data);
    })();
    return () => ac.abort();
  }, []);

  const integrationTypes = useMemo(
    () => [...new Set(allRows.map((r) => r.integrationType).filter(Boolean))].sort(),
    [allRows]
  );
  const frequencies = useMemo(
    () => [...new Set(allRows.map((r) => r.frequency).filter(Boolean))].sort(),
    [allRows]
  );

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "integration-flows",
    INTEGRATION_FLOW_COLUMNS,
    INTEGRATION_FLOW_FILTER_FIELDS,
    {
      lockedKeys: ["flowCode"],
      defaultHiddenFilters: INTEGRATION_FLOW_DEFAULT_HIDDEN_FILTER_KEYS,
      defaultHiddenColumns: INTEGRATION_FLOW_DEFAULT_HIDDEN_COLUMN_KEYS,
    }
  );

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  return (
    <div>
      <TopBar
        pageKey="integration-flows"
        trailing={<PageDocumentation pageKey="integration-flows" />}
        title="Key Integration Flows"
        subtitle={`${rows.length} integration flow${rows.length === 1 ? "" : "s"}`}
      />
      {!tablePending && (
        <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
          {isFilterVisible("integrationType") && (
            <FilterSelect value={values.integrationType} onChange={(v) => setFilter("integrationType", v)}>
              <option value="">All integration types</option>
              {integrationTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("frequency") && (
            <FilterSelect value={values.frequency} onChange={(v) => setFilter("frequency", v)}>
              <option value="">All frequencies</option>
              {frequencies.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("sourceSystemQ") && (
            <FilterTextInput
              value={values.sourceSystemQ}
              onChange={(v) => setFilter("sourceSystemQ", v)}
              placeholder="Source system…"
            />
          )}
          {isFilterVisible("targetSystemQ") && (
            <FilterTextInput
              value={values.targetSystemQ}
              onChange={(v) => setFilter("targetSystemQ", v)}
              placeholder="Target system…"
            />
          )}
          {isFilterVisible("businessPurposeQ") && (
            <FilterTextInput
              value={values.businessPurposeQ}
              onChange={(v) => setFilter("businessPurposeQ", v)}
              placeholder="Business purpose…"
            />
          )}
          {isFilterVisible("dataElementsQ") && (
            <FilterTextInput
              value={values.dataElementsQ}
              onChange={(v) => setFilter("dataElementsQ", v)}
              placeholder="Data elements…"
            />
          )}
          {isFilterVisible("flowCodeQ") && (
            <FilterTextInput
              value={values.flowCodeQ}
              onChange={(v) => setFilter("flowCodeQ", v)}
              placeholder="Flow ID…"
            />
          )}
        </TableFilterBar>
      )}
      {tablePending ? (
        <TableSkeleton columns={INTEGRATION_FLOW_COLUMNS.length} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-12 text-center">
          <Share2 className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            {hasActive ? "No flows match the selected filters." : "No integration flows recorded."}
          </p>
        </div>
      ) : (
        <DataTable
          title="Integration Flows"
          icon={Share2}
          toolbar={
            <TablePageToolbar
              columnPicker={columnPicker}
              presets={INTEGRATION_FLOW_SORT_PRESETS}
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
                  columns={INTEGRATION_FLOW_COLUMNS}
                  isColumnVisible={isColumnVisible}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={tableRow}>
                    {isColumnVisible("flowCode") && (
                      <td className={`${tableCell} whitespace-nowrap font-mono text-xs`}>
                        <ProgressLink href={`/integration-flows/${r.id}`} className="text-brand-600 dark:text-brand-400 hover:underline">
                          {r.flowCode}
                        </ProgressLink>
                      </td>
                    )}
                    {isColumnVisible("sourceSystem") && (
                      <td className={`${tableCell} whitespace-nowrap`}>{r.sourceSystem}</td>
                    )}
                    {isColumnVisible("targetSystem") && (
                      <td className={`${tableCell} whitespace-nowrap`}>{r.targetSystem}</td>
                    )}
                    {isColumnVisible("integrationType") && (
                      <td className={`${tableCell} whitespace-nowrap`}>{r.integrationType}</td>
                    )}
                    {isColumnVisible("frequency") && (
                      <td className={`${tableCell} whitespace-nowrap`}>{r.frequency}</td>
                    )}
                    {isColumnVisible("dataElements") && (
                      <td className={`${tableCell} truncate max-w-[220px]`} title={r.dataElements}>
                        {r.dataElements}
                      </td>
                    )}
                    {isColumnVisible("businessPurpose") && (
                      <td className={`${tableCell} truncate max-w-[220px]`} title={r.businessPurpose}>
                        {r.businessPurpose}
                      </td>
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
