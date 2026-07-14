"use client";

import { Suspense } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTableFilters } from "@/hooks/useTableFilters";
import { REFERENCE_DATA_FILTER_SCHEMA } from "@/lib/table-filters";
import { FilterRangeInputs, FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import {
  REFERENCE_DATA_COLUMNS,
  REFERENCE_DATA_DEFAULT_HIDDEN_FILTER_KEYS,
  REFERENCE_DATA_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { REFERENCE_DATA_SORT_PRESETS } from "@/lib/table-sort-presets";
import { TopBar } from "@/components/layout/TopBar";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import {
  apiJson,
  FormField,
  FormModal,
  inputClass,
  MasterDataEmptyState,
  MasterDataError,
  MasterDataLoading,
  MasterDataTableShell,
  SortableTh,
  tdClass,
  thClass,
} from "@/components/master-data/shared";
import type { SortDirection } from "@/lib/table-sort";
import { canEdit as sessionCanEdit, type SessionUser } from "@/lib/auth/roles";
import { loadJsonEffect } from "@/lib/safe-fetch";

type ReferenceDataRow = {
  id: string;
  category: string;
  value: string;
  sortOrder: number;
  active: boolean;
};

type ValueFormState = { value: string; sortOrder: string; active: boolean };
const emptyValueForm: ValueFormState = { value: "", sortOrder: "0", active: true };

/**
 * General-purpose management screen for the ReferenceData lookup table.
 * Categories aren't a separate table — they're just the distinct set of
 * `category` strings already present in ReferenceData rows, so "+ New
 * Category" is really just creating the first value for a category that
 * doesn't exist yet.
 */
export function ReferenceDataManager() {
  const { values, setFilter, setSort, clearAll, hasActive, apiQuery } = useTableFilters(REFERENCE_DATA_FILTER_SCHEMA);
  const [rows, setRows] = useState<ReferenceDataRow[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const canEdit = sessionCanEdit(user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedCategory = values.category;
  const sortKey = (values.sort || "sortOrder") as "value" | "sortOrder" | "active";
  const sortDir = (values.sortDir === "desc" ? "desc" : "asc") as SortDirection;

  const toggleSort = (key: "value" | "sortOrder" | "active", dir?: SortDirection) => {
    if (dir) {
      setSort(key, dir);
      return;
    }
    if (sortKey === key) setFilter("sortDir", sortDir === "asc" ? "desc" : "asc");
    else setSort(key, "asc");
  };

  const [valueModalOpen, setValueModalOpen] = useState(false);
  const [editingValue, setEditingValue] = useState<ReferenceDataRow | null>(null);
  const [valueForm, setValueForm] = useState<ValueFormState>(emptyValueForm);
  const [valueFormError, setValueFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ category: "", value: "" });
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = apiQuery ? `${apiQuery}&includeInactive=1` : "?includeInactive=1";
      const data = await apiJson<ReferenceDataRow[]>(`/api/reference-data${qs}`);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reference data");
    } finally {
      setLoading(false);
    }
  }, [apiQuery]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return loadJsonEffect<{ user: SessionUser }>("/api/auth/me", (data) => setUser(data.user), {
      label: "reference-data-auth",
    });
  }, []);

  const categories = useMemo(() => {
    const map = new Map<string, { total: number; active: number }>();
    for (const r of rows) {
      const entry = map.get(r.category) ?? { total: 0, active: 0 };
      entry.total += 1;
      if (r.active) entry.active += 1;
      map.set(r.category, entry);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([category, stats]) => ({ category, ...stats }));
  }, [rows]);

  useEffect(() => {
    if (!selectedCategory && categories.length > 0) {
      setFilter("category", categories[0].category);
    }
  }, [categories, selectedCategory, setFilter]);

  const categoryRows = useMemo(() => {
    const filtered = rows.filter((r) => r.category === selectedCategory);
    const dir = sortDir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "value") return a.value.localeCompare(b.value) * dir;
      if (sortKey === "active") return (Number(a.active) - Number(b.active)) * dir;
      // sortOrder default
      const byOrder = (a.sortOrder - b.sortOrder) * dir;
      return byOrder !== 0 ? byOrder : a.value.localeCompare(b.value);
    });
  }, [rows, selectedCategory, sortKey, sortDir]);

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "reference-data",
    REFERENCE_DATA_COLUMNS,
    REFERENCE_DATA_FILTER_FIELDS,
    {
      lockedKeys: ["value", "actions"],
      defaultHiddenFilters: REFERENCE_DATA_DEFAULT_HIDDEN_FILTER_KEYS,
    }
  );

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  const openAddValue = () => {
    setEditingValue(null);
    setValueForm({ value: "", sortOrder: String((categoryRows.at(-1)?.sortOrder ?? 0) + 1), active: true });
    setValueFormError(null);
    setValueModalOpen(true);
  };

  const openEditValue = (row: ReferenceDataRow) => {
    setEditingValue(row);
    setValueForm({ value: row.value, sortOrder: String(row.sortOrder), active: row.active });
    setValueFormError(null);
    setValueModalOpen(true);
  };

  const handleValueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valueForm.value.trim()) {
      setValueFormError("Value is required");
      return;
    }
    const sortOrder = Number(valueForm.sortOrder);
    if (Number.isNaN(sortOrder)) {
      setValueFormError("Sort order must be a number");
      return;
    }
    setSubmitting(true);
    setValueFormError(null);
    try {
      if (editingValue) {
        await apiJson(`/api/reference-data/${editingValue.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: valueForm.value.trim(), sortOrder, active: valueForm.active }),
        });
      } else {
        await apiJson("/api/reference-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: selectedCategory, value: valueForm.value.trim(), sortOrder, active: valueForm.active }),
        });
      }
      setValueModalOpen(false);
      await load();
    } catch (err) {
      setValueFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (row: ReferenceDataRow) => {
    try {
      await apiJson(`/api/reference-data/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !row.active }),
      });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed");
    }
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryForm.category.trim() || !categoryForm.value.trim()) {
      setCategoryFormError("Category key and first value are required");
      return;
    }
    setSubmitting(true);
    setCategoryFormError(null);
    try {
      await apiJson("/api/reference-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: categoryForm.category.trim(), value: categoryForm.value.trim(), sortOrder: 1, active: true }),
      });
      setCategoryModalOpen(false);
      setFilter("category", categoryForm.category.trim());
      setCategoryForm({ category: "", value: "" });
      await load();
    } catch (err) {
      setCategoryFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex gap-8 w-full max-w-full font-sans pb-24 min-w-0">
      <aside className="hidden lg:block w-72 shrink-0 sticky top-24 h-[calc(100vh-140px)] flex flex-col border border-gray-200 rounded-xl bg-white p-4 shadow-theme-sm overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">Categories</h2>
          {canEdit ? (
            <button
              type="button"
              onClick={() => {
                setCategoryForm({ category: "", value: "" });
                setCategoryFormError(null);
                setCategoryModalOpen(true);
              }}
              className="flex items-center gap-1 rounded-lg bg-[#2548C9] px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1E3A9F]"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          ) : null}
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {categories.map((c) => (
            <button
              key={c.category}
              onClick={() => setFilter("category", c.category)}
              className={cn(
                "w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-between",
                selectedCategory === c.category
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <span className="truncate">{c.category}</span>
              <span className="text-[10px] font-normal text-gray-400 shrink-0 ml-2">
                {c.active}/{c.total}
              </span>
            </button>
          ))}
          {categories.length === 0 && !loading && (
            <p className="text-xs text-gray-400 text-center py-4">No categories yet — create one.</p>
          )}
        </div>
      </aside>

      <div className="flex-1 min-w-0 space-y-6">
        <TopBar
          pageKey="reference-data"
          title="Reference Data"
          trailing={<PageDocumentation pageKey="reference-data" />}
        />

        {/* Mobile / tablet category picker — sidebar is lg+ only */}
        <div className="flex flex-wrap items-end gap-2 lg:hidden">
          <label className="min-w-0 flex-1 text-sm text-gray-700 dark:text-white/80">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-white/45">
              Category
            </span>
            <select
              className="h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 shadow-sm dark:border-[var(--border)] dark:bg-[var(--card)] dark:text-white"
              value={selectedCategory ?? ""}
              onChange={(e) => setFilter("category", e.target.value)}
              aria-label="Select category"
            >
              {categories.length === 0 ? (
                <option value="">No categories yet</option>
              ) : (
                categories.map((c) => (
                  <option key={c.category} value={c.category}>
                    {c.category} ({c.active}/{c.total})
                  </option>
                ))
              )}
            </select>
          </label>
          {canEdit ? (
            <button
              type="button"
              onClick={() => {
                setCategoryForm({ category: "", value: "" });
                setCategoryFormError(null);
                setCategoryModalOpen(true);
              }}
              className="flex h-10 shrink-0 items-center gap-1 rounded-lg bg-[#2548C9] px-3 text-[12px] font-semibold text-white hover:bg-[#1E3A9F]"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          ) : null}
        </div>

        {error && <MasterDataError message={error} onRetry={load} />}

        <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
          {isFilterVisible("active") && (
            <FilterSelect value={values.active} onChange={(v) => setFilter("active", v)}>
              <option value="">All values</option>
              <option value="true">Active only</option>
              <option value="false">Inactive only</option>
            </FilterSelect>
          )}
          {isFilterVisible("valueQ") && (
            <FilterTextInput
              value={values.valueQ}
              onChange={(v) => setFilter("valueQ", v)}
              placeholder="Value…"
            />
          )}
          {isFilterVisible("sortOrder") && (
            <div className="inline-flex items-center gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Sort</span>
              <FilterRangeInputs
                minValue={values.sortOrderMin}
                maxValue={values.sortOrderMax}
                onMinChange={(v) => setFilter("sortOrderMin", v)}
                onMaxChange={(v) => setFilter("sortOrderMax", v)}
              />
            </div>
          )}
        </TableFilterBar>

        {tablePending ? (
          <MasterDataLoading columns={REFERENCE_DATA_COLUMNS.length} />
        ) : !selectedCategory ? (
          canEdit ? (
            <MasterDataEmptyState
              entityLabel="categories"
              addLabel="New Category"
              onAdd={() => {
                setCategoryForm({ category: "", value: "" });
                setCategoryFormError(null);
                setCategoryModalOpen(true);
              }}
            />
          ) : (
            <p className="py-16 text-center text-[15px] font-medium text-gray-600">
              No categories yet. Ask an editor to create one.
            </p>
          )
        ) : (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[18px] font-bold text-gray-900 flex items-center gap-2">
                <Database className="h-4 w-4 text-gray-400" />
                {selectedCategory}
              </h2>
              {canEdit ? (
                <button
                  type="button"
                  onClick={openAddValue}
                  className="flex items-center gap-2 rounded-lg bg-[#2548C9] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#1E3A9F]"
                >
                  <Plus className="h-4 w-4" /> Add Value
                </button>
              ) : null}
            </div>

            <MasterDataTableShell
              scrollShell
              toolbar={
                <TablePageToolbar
                  columnPicker={columnPicker}
                  presets={REFERENCE_DATA_SORT_PRESETS}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSelectSort={setSort}
                />
              }
            >
              {categoryRows.length === 0 ? (
                <MasterDataEmptyState entityLabel="values" addLabel="Add Value" onAdd={openAddValue} />
              ) : (
                <table className="w-full min-w-max border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/50">
                      {isColumnVisible("value") && (
                        <SortableTh
                          label="Value"
                          active={sortKey === "value"}
                          dir={sortDir}
                          onSort={(dir) => toggleSort("value", dir)}
                        />
                      )}
                      {isColumnVisible("sortOrder") && (
                        <SortableTh
                          label="Sort Order"
                          active={sortKey === "sortOrder"}
                          dir={sortDir}
                          onSort={(dir) => toggleSort("sortOrder", dir)}
                        />
                      )}
                      {isColumnVisible("active") && (
                        <SortableTh
                          label="Active"
                          active={sortKey === "active"}
                          dir={sortDir}
                          onSort={(dir) => toggleSort("active", dir)}
                        />
                      )}
                      <th className={`${thClass} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryRows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-gray-200 dark:border-[var(--border)] hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-200"
                      >
                        {isColumnVisible("value") && <td className={`${tdClass} font-semibold text-gray-900`}>{row.value}</td>}
                        {isColumnVisible("sortOrder") && <td className={cn(tdClass, "font-mono text-gray-500")}>{row.sortOrder}</td>}
                        {isColumnVisible("active") && (
                        <td className={tdClass}>
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => toggleActive(row)}
                              className={cn(
                                "px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border",
                                row.active
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-gray-50 text-gray-500 border-gray-200"
                              )}
                            >
                              {row.active ? "Active" : "Inactive"}
                            </button>
                          ) : (
                            <span
                              className={cn(
                                "px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border",
                                row.active
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-gray-50 text-gray-500 border-gray-200"
                              )}
                            >
                              {row.active ? "Active" : "Inactive"}
                            </span>
                          )}
                        </td>
                        )}
                        <td className={`${tdClass} text-right`}>
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => openEditValue(row)}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Edit
                            </button>
                          ) : (
                            <span className="text-[12px] text-gray-400">View only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </MasterDataTableShell>
          </div>
        )}
      </div>

      <FormModal
        open={valueModalOpen}
        title={editingValue ? "Edit Value" : `Add Value — ${selectedCategory}`}
        onClose={() => setValueModalOpen(false)}
        onSubmit={handleValueSubmit}
        submitting={submitting}
      >
        {valueFormError && <p className="text-[13px] text-red-600">{valueFormError}</p>}
        <FormField label="Value" required>
          <input className={inputClass} value={valueForm.value} onChange={(e) => setValueForm((f) => ({ ...f, value: e.target.value }))} />
        </FormField>
        <FormField label="Sort Order" required>
          <input
            type="number"
            className={inputClass}
            value={valueForm.sortOrder}
            onChange={(e) => setValueForm((f) => ({ ...f, sortOrder: e.target.value }))}
          />
        </FormField>
        <FormField label="Active">
          <select
            className={inputClass}
            value={valueForm.active ? "true" : "false"}
            onChange={(e) => setValueForm((f) => ({ ...f, active: e.target.value === "true" }))}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </FormField>
      </FormModal>

      <FormModal
        open={categoryModalOpen}
        title="New Category"
        onClose={() => setCategoryModalOpen(false)}
        onSubmit={handleCategorySubmit}
        submitting={submitting}
      >
        {categoryFormError && <p className="text-[13px] text-red-600">{categoryFormError}</p>}
        <FormField label="Category Key" required>
          <input
            className={inputClass}
            placeholder="e.g. severity, status, risk_category"
            value={categoryForm.category}
            onChange={(e) => setCategoryForm((f) => ({ ...f, category: e.target.value }))}
          />
        </FormField>
        <FormField label="First Value" required>
          <input
            className={inputClass}
            placeholder="e.g. Critical"
            value={categoryForm.value}
            onChange={(e) => setCategoryForm((f) => ({ ...f, value: e.target.value }))}
          />
        </FormField>
      </FormModal>
    </div>
  );
}
