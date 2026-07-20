"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Server } from "lucide-react";
import { FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import {
  DataTable,
  SortableTh,
  dataTableTableClass,
  tableCell,
  tableHeadCell,
  tableRow,
} from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useTableFilters } from "@/hooks/useTableFilters";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { useTableSort } from "@/hooks/useTableSort";
import { withTableSort, type FilterSchema } from "@/lib/table-filters";
import {
  SHARED_ENVIRONMENT_COLUMNS,
  SHARED_ENVIRONMENT_DEFAULT_HIDDEN_COLUMN_KEYS,
  SHARED_ENVIRONMENT_DEFAULT_HIDDEN_FILTER_KEYS,
  SHARED_ENVIRONMENT_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { SHARED_ENVIRONMENT_SORT_PRESETS } from "@/lib/table-sort-presets";
import { MappingFormField, mappingInputClass, SystemMappingModal } from "./SystemMappingModal";
import {
  AddMappingRecordButton,
  MappingEmpty,
  MappingError,
  MappingRecordActions,
  MappingSectionHeader,
} from "./SystemMappingUi";
import type { SharedEnvironmentRow } from "./types";

/** Defined in this client module so HMR cannot leave the schema binding undefined. */
const SHARED_ENVIRONMENTS_FILTER_SCHEMA: FilterSchema = withTableSort([
  { key: "environmentCodeQ", param: "environmentCodeQ" },
  { key: "environmentType", param: "environmentType" },
  { key: "sharedByQ", param: "sharedByQ" },
  { key: "capacityQ", param: "capacityQ" },
  { key: "bookingRequirementQ", param: "bookingRequirementQ" },
  { key: "conflictRisk", param: "conflictRisk" },
]);

type SharedEnvironmentForm = Omit<SharedEnvironmentRow, "id" | "sourceOrder">;

const EMPTY_ENVIRONMENT: SharedEnvironmentForm = {
  environmentCode: "",
  environmentType: "",
  sharedBy: "",
  capacity: "",
  bookingRequirement: "",
  conflictRisk: "",
};

type FilterOptions = {
  environmentTypes: string[];
  bookingRequirements: string[];
  conflictRisks: string[];
};

/** Table-standard shared environment inventory with server-side URL filters and sorting. */
export function SharedEnvironments({ canEdit }: { canEdit: boolean }) {
  const { values, setFilter, setSort, clearAll, hasActive, apiUrl } = useTableFilters(SHARED_ENVIRONMENTS_FILTER_SCHEMA);
  const { sortKey, sortDir, toggleSort } = useTableSort(values, setFilter, "environmentCode", "asc");
  const [items, setItems] = useState<SharedEnvironmentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [options, setOptions] = useState<FilterOptions>({ environmentTypes: [], bookingRequirements: [], conflictRisks: [] });
  const [editing, setEditing] = useState<SharedEnvironmentRow | null | undefined>(undefined);
  const [form, setForm] = useState(EMPTY_ENVIRONMENT);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "system-mapping-shared-environments",
    SHARED_ENVIRONMENT_COLUMNS,
    SHARED_ENVIRONMENT_FILTER_FIELDS,
    {
      lockedKeys: ["environmentCode", "actions"],
      defaultHiddenFilters: SHARED_ENVIRONMENT_DEFAULT_HIDDEN_FILTER_KEYS,
      defaultHiddenColumns: SHARED_ENVIRONMENT_DEFAULT_HIDDEN_COLUMN_KEYS,
    },
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(apiUrl("/api/system-mapping/shared-environments"));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to load shared environments.");
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load shared environments.");
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/system-mapping/shared-environments", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        const rows: SharedEnvironmentRow[] = Array.isArray(data.items) ? data.items : [];
        setOptions({
          environmentTypes: [...new Set(rows.map((row) => row.environmentType).filter(Boolean))].sort(),
          bookingRequirements: [...new Set(rows.map((row) => row.bookingRequirement).filter(Boolean))].sort(),
          conflictRisks: [...new Set(rows.map((row) => row.conflictRisk).filter(Boolean))].sort(),
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [reloadToken]);

  const refetch = () => setReloadToken((token) => token + 1);

  const openCreate = () => {
    setForm(EMPTY_ENVIRONMENT);
    setEditing(null);
    setFormError(null);
  };

  const openEdit = (item: SharedEnvironmentRow) => {
    setForm({
      environmentCode: item.environmentCode,
      environmentType: item.environmentType,
      sharedBy: item.sharedBy,
      capacity: item.capacity,
      bookingRequirement: item.bookingRequirement,
      conflictRisk: item.conflictRisk,
    });
    setEditing(item);
    setFormError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      ...form,
      environmentCode: form.environmentCode.trim(),
      environmentType: form.environmentType.trim(),
      sharedBy: form.sharedBy.trim(),
      capacity: form.capacity.trim(),
      bookingRequirement: form.bookingRequirement.trim(),
      conflictRisk: form.conflictRisk.trim().toUpperCase(),
    };
    if (Object.values(payload).some((value) => !value)) {
      setFormError("Complete every field.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch(
        editing ? `/api/system-mapping/shared-environments/${editing.id}` : "/api/system-mapping/shared-environments",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to save the shared environment.");
      setEditing(undefined);
      refetch();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save the shared environment.");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (item: SharedEnvironmentRow) => {
    if (!window.confirm(`Delete ${item.environmentCode}? This action cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/system-mapping/shared-environments/${item.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to delete the shared environment.");
      refetch();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to delete the shared environment.");
    }
  };

  const filterSelect = (key: string, label: string, valuesForFilter: string[]) => (
    <FilterSelect value={values[key]} onChange={(value) => setFilter(key, value)}>
      <option value="">All {label.toLowerCase()}</option>
      {valuesForFilter.map((value) => <option key={value} value={value}>{value}</option>)}
    </FilterSelect>
  );

  const headers = useMemo(() => SHARED_ENVIRONMENT_COLUMNS.filter((column) => isColumnVisible(column.key)), [isColumnVisible]);
  const pending = loading || !prefsLoaded;

  return (
    <section className="min-w-0">
      <MappingSectionHeader
        icon={Server}
        title="Shared Environments"
        description={`${total} environment${total === 1 ? "" : "s"} across shared release infrastructure.`}
        action={canEdit ? <AddMappingRecordButton label="Add environment" onClick={openCreate} /> : undefined}
      />
      {!pending && (
        <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
          {isFilterVisible("environmentCodeQ") && <FilterTextInput value={values.environmentCodeQ} onChange={(value) => setFilter("environmentCodeQ", value)} placeholder="Environment code…" />}
          {isFilterVisible("environmentType") && filterSelect("environmentType", "environment types", options.environmentTypes)}
          {isFilterVisible("sharedByQ") && <FilterTextInput value={values.sharedByQ} onChange={(value) => setFilter("sharedByQ", value)} placeholder="Shared by…" />}
          {isFilterVisible("capacityQ") && <FilterTextInput value={values.capacityQ} onChange={(value) => setFilter("capacityQ", value)} placeholder="Capacity…" />}
          {isFilterVisible("bookingRequirementQ") && filterSelect("bookingRequirementQ", "booking requirements", options.bookingRequirements)}
          {isFilterVisible("conflictRisk") && filterSelect("conflictRisk", "conflict risks", options.conflictRisks)}
        </TableFilterBar>
      )}
      {pending ? (
        <TableSkeleton columns={SHARED_ENVIRONMENT_COLUMNS.length} />
      ) : loadError ? (
        <MappingError message={loadError} onRetry={refetch} />
      ) : items.length === 0 ? (
        <MappingEmpty message={hasActive ? "No shared environments match the selected filters." : "No shared environments have been recorded."} />
      ) : (
        <DataTable
          title="Environment inventory"
          subtitle={`${total} matching record${total === 1 ? "" : "s"}`}
          icon={Server}
          toolbar={<TablePageToolbar columnPicker={columnPicker} presets={SHARED_ENVIRONMENT_SORT_PRESETS} sortKey={sortKey} sortDir={sortDir} onSelectSort={setSort} />}
        >
          <table className={dataTableTableClass}>
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-[var(--border)] dark:bg-[var(--card)]">
                {headers.map((column) => column.key === "actions" ? (
                  <th key={column.key} className={tableHeadCell}>{column.label}</th>
                ) : (
                  <SortableTh
                    key={column.key}
                    label={column.label}
                    active={sortKey === column.key}
                    dir={sortDir}
                    onSort={(direction) => toggleSort(column.key, direction)}
                    className={column.key === "environmentCode" ? "left-0 z-30" : undefined}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={tableRow}>
                  {isColumnVisible("environmentCode") && <td className={`${tableCell} sticky left-0 z-10 whitespace-nowrap bg-white font-mono text-xs font-semibold text-brand-700 group-hover:bg-gray-50 dark:bg-[var(--card)] dark:text-brand-300 dark:group-hover:bg-gray-800`}>{item.environmentCode}</td>}
                  {isColumnVisible("environmentType") && <td className={`${tableCell} whitespace-nowrap`}>{item.environmentType}</td>}
                  {isColumnVisible("sharedBy") && <td className={`${tableCell} min-w-48`}>{item.sharedBy}</td>}
                  {isColumnVisible("capacity") && <td className={`${tableCell} whitespace-nowrap`}>{item.capacity}</td>}
                  {isColumnVisible("bookingRequirement") && <td className={`${tableCell} min-w-52`}>{item.bookingRequirement}</td>}
                  {isColumnVisible("conflictRisk") && <td className={`${tableCell} whitespace-nowrap`}><RiskPill value={item.conflictRisk} /></td>}
                  <td className={`${tableCell} whitespace-nowrap`}>
                    {canEdit ? <MappingRecordActions label={item.environmentCode} onEdit={() => openEdit(item)} onDelete={() => void remove(item)} /> : <span className="text-xs text-gray-400">Read only</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}

      <SystemMappingModal
        open={editing !== undefined}
        title={editing ? "Edit shared environment" : "Add shared environment"}
        submitting={submitting}
        error={formError}
        onClose={() => setEditing(undefined)}
        onSubmit={submit}
      >
        {(["environmentCode", "environmentType", "sharedBy", "capacity", "bookingRequirement"] as const).map((key) => (
          <MappingFormField key={key} label={{
            environmentCode: "Environment code",
            environmentType: "Environment type",
            sharedBy: "Shared by",
            capacity: "Capacity",
            bookingRequirement: "Booking requirement",
          }[key]}>
            <input required value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className={mappingInputClass} />
          </MappingFormField>
        ))}
        <MappingFormField label="Conflict risk">
          <select
            required
            value={form.conflictRisk}
            onChange={(event) => setForm((current) => ({ ...current, conflictRisk: event.target.value }))}
            className={mappingInputClass}
          >
            <option value="" disabled>Select risk level</option>
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((risk) => (
              <option key={risk} value={risk}>{risk}</option>
            ))}
          </select>
        </MappingFormField>
      </SystemMappingModal>
    </section>
  );
}

function RiskPill({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const className = normalized.includes("critical") || normalized.includes("high")
    ? "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-300"
    : normalized.includes("medium")
      ? "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-300"
      : "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-300";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{value}</span>;
}
