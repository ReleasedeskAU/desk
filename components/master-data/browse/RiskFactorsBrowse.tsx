"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import {
  DEFAULT_PAGE_SIZE,
  pageCount,
  paginateRows,
  type SortDir,
} from "@/lib/master-data/table-utils";
import { useTableFilters } from "@/hooks/useTableFilters";
import { RISK_FACTORS_FILTER_SCHEMA } from "@/lib/table-filters";
import { FilterRangeInputs, FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import {
  RISK_FACTOR_COLUMNS,
  RISK_FACTOR_DEFAULT_HIDDEN_COLUMN_KEYS,
  RISK_FACTOR_DEFAULT_HIDDEN_FILTER_KEYS,
  RISK_FACTOR_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { RISK_FACTOR_SORT_PRESETS } from "@/lib/table-sort-presets";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import {
  apiJson,
  BrowseToolbar,
  FormField,
  FormModal,
  inputClass,
  MasterDataEmptyState,
  MasterDataError,
  MasterDataLoading,
  MasterDataTableShell,
  RowActionsMenu,
  SortableTh,
  tdClass,
  thClass,
} from "@/components/master-data/shared";

export type RiskFactorRow = {
  id: string;
  category: string;
  factorName: string;
  weight: number;
  description: string | null;
  active: boolean;
  order: number | null;
};

type FormState = { category: string; factorName: string; weight: string; description: string; active: boolean };
const emptyForm: FormState = { category: "", factorName: "", weight: "", description: "", active: true };

type SortKey = "category" | "factorName" | "weight";

export function RiskFactorsBrowse() {
  const { values, setFilter, setSort, clearAll, hasActive, apiQuery } = useTableFilters(RISK_FACTORS_FILTER_SCHEMA);
  const [rows, setRows] = useState<RiskFactorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const search = values.q;
  const page = parseInt(values.page || "1", 10) || 1;
  const sortKey = (values.sort || "category") as SortKey;
  const sortDir = (values.sortDir || "asc") as SortDir;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RiskFactorRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<RiskFactorRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await apiJson<RiskFactorRow[]>(`/api/risk-factors${apiQuery}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load risk factors");
    } finally {
      setLoading(false);
    }
  }, [apiQuery]);

  useEffect(() => {
    load();
  }, [load]);

  const activeWeightSum = useMemo(
    () => rows.filter((r) => r.active).reduce((s, r) => s + r.weight, 0),
    [rows]
  );

  const totalPages = pageCount(rows.length, DEFAULT_PAGE_SIZE);
  const pageRows = paginateRows(rows, page, DEFAULT_PAGE_SIZE);

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "risk-factors",
    RISK_FACTOR_COLUMNS,
    RISK_FACTOR_FILTER_FIELDS,
    {
      lockedKeys: ["factorName", "actions"],
      defaultHiddenFilters: RISK_FACTOR_DEFAULT_HIDDEN_FILTER_KEYS,
      defaultHiddenColumns: RISK_FACTOR_DEFAULT_HIDDEN_COLUMN_KEYS,
    }
  );

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  const toggleSort = (key: SortKey, dir?: "asc" | "desc") => {
    if (dir) {
      setSort(key, dir);
      return;
    }
    if (sortKey === key) setFilter("sortDir", sortDir === "asc" ? "desc" : "asc");
    else {
      setFilter("sort", key);
      setFilter("sortDir", "asc");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setCreated(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (row: RiskFactorRow) => {
    setEditing(row);
    setForm({
      category: row.category,
      factorName: row.factorName,
      weight: String(row.weight),
      description: row.description ?? "",
      active: row.active,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const weight = Number(form.weight);
    if (!form.category.trim() || !form.factorName.trim()) {
      setFormError("Category and factor name are required");
      return;
    }
    if (Number.isNaN(weight) || weight <= 0) {
      setFormError("Weight must be a positive number");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        category: form.category.trim(),
        factorName: form.factorName.trim(),
        weight,
        description: form.description.trim() || null,
        active: form.active,
      };
      if (editing) {
        await apiJson(`/api/risk-factors/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setModalOpen(false);
      } else {
        const row = await apiJson<RiskFactorRow>("/api/risk-factors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setModalOpen(false);
        setCreated(row);
      }
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: RiskFactorRow) => {
    if (!confirm(`Delete risk factor "${row.factorName}"?`)) return;
    try {
      await apiJson(`/api/risk-factors/${row.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const toggleActive = async (row: RiskFactorRow) => {
    try {
      await apiJson(`/api/risk-factors/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !row.active }),
      });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-2">
        <TopBar
          pageKey="risk-factors"
          title="Risk Factors"
          subtitle={`${rows.length} weighted-scoring factors`}
          className="mb-0 flex-1"
        />
        <div className="flex shrink-0 items-center gap-2">
          <PageDocumentation pageKey="risk-factors" />
          <button
          type="button"
          onClick={openCreate}
          className="shrink-0 rounded-lg bg-[#2548C9] px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-[#1E3A9F]"
        >
          Add Risk Factor
        </button>
        </div>
      </div>

      <p className="text-[13px] text-gray-500 mb-4">
        Active weights sum to <strong className="text-gray-800">{activeWeightSum.toFixed(3)}</strong> — this is the
        verified value from the source formula (not exactly 1.0 due to source rounding).
      </p>

      {error && <MasterDataError message={error} onRetry={load} />}

      <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
        {isFilterVisible("category") && (
          <FilterSelect value={values.category} onChange={(v) => setFilter("category", v)}>
            <option value="">All categories</option>
            {[...new Set(rows.map((r) => r.category).filter(Boolean))].sort().map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </FilterSelect>
        )}
        {isFilterVisible("active") && (
          <FilterSelect value={values.active} onChange={(v) => setFilter("active", v)}>
            <option value="">All</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </FilterSelect>
        )}
        {isFilterVisible("factorNameQ") && (
          <FilterTextInput
            value={values.factorNameQ}
            onChange={(v) => setFilter("factorNameQ", v)}
            placeholder="Factor name…"
          />
        )}
        {isFilterVisible("weight") && (
          <div className="inline-flex items-center gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Weight</span>
            <FilterRangeInputs
              minValue={values.weightMin}
              maxValue={values.weightMax}
              onMinChange={(v) => setFilter("weightMin", v)}
              onMaxChange={(v) => setFilter("weightMax", v)}
            />
          </div>
        )}
        {isFilterVisible("descriptionQ") && (
          <FilterTextInput
            value={values.descriptionQ}
            onChange={(v) => setFilter("descriptionQ", v)}
            placeholder="Description…"
          />
        )}
      </TableFilterBar>

      <MasterDataTableShell scrollShell toolbar={<TablePageToolbar columnPicker={columnPicker} presets={RISK_FACTOR_SORT_PRESETS} sortKey={sortKey} sortDir={sortDir} onSelectSort={setSort} />}>
        <BrowseToolbar
          search={search}
          onSearchChange={(v) => setFilter("q", v)}
          page={page}
          totalPages={totalPages}
          totalRows={rows.length}
          pageSize={DEFAULT_PAGE_SIZE}
          onPageChange={(p) => setFilter("page", String(p))}
        />
        {tablePending ? (
          <MasterDataLoading columns={RISK_FACTOR_COLUMNS.length} />
        ) : rows.length === 0 ? (
          <MasterDataEmptyState entityLabel="risk factors" addLabel="Add Risk Factor" onAdd={openCreate} />
        ) : (
          <table className="w-full min-w-max border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                {isColumnVisible("category") && (
                  <SortableTh label="Category" active={sortKey === "category"} dir={sortDir} onSort={(dir) => toggleSort("category", dir)} />
                )}
                {isColumnVisible("factorName") && (
                  <SortableTh label="Factor Name" active={sortKey === "factorName"} dir={sortDir} onSort={(dir) => toggleSort("factorName", dir)} />
                )}
                {isColumnVisible("weight") && (
                  <SortableTh label="Weight" active={sortKey === "weight"} dir={sortDir} onSort={(dir) => toggleSort("weight", dir)} />
                )}
                {isColumnVisible("description") && <th className={thClass}>Description</th>}
                {isColumnVisible("active") && <th className={thClass}>Active</th>}
                <th className={`${thClass} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-200">
                  {isColumnVisible("category") && <td className={tdClass}>{row.category}</td>}
                  {isColumnVisible("factorName") && <td className={`${tdClass} font-semibold text-gray-900`}>{row.factorName}</td>}
                  {isColumnVisible("weight") && <td className={tdClass}>{row.weight}</td>}
                  {isColumnVisible("description") && <td className={`${tdClass} text-gray-500 max-w-[280px] truncate`} title={row.description ?? ""}>{row.description || "—"}</td>}
                  {isColumnVisible("active") && (
                  <td className={tdClass}>
                    <button
                      type="button"
                      onClick={() => toggleActive(row)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border ${
                        row.active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-gray-50 text-gray-500 border-gray-200"
                      }`}
                    >
                      {row.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  )}
                  <td className={`${tdClass} text-right`}>
                    <RowActionsMenu onEdit={() => openEdit(row)} onDelete={() => handleDelete(row)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </MasterDataTableShell>

      <FormModal
        open={modalOpen}
        title={editing ? "Edit Risk Factor" : "Add Risk Factor"}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        submitting={submitting}
      >
        {formError && <p className="text-[13px] text-red-600">{formError}</p>}
        <FormField label="Category" required>
          <input className={inputClass} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
        </FormField>
        <FormField label="Factor Name" required>
          <input className={inputClass} value={form.factorName} onChange={(e) => setForm((f) => ({ ...f, factorName: e.target.value }))} />
        </FormField>
        <FormField label="Weight" required>
          <input type="number" step="0.001" className={inputClass} value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} />
        </FormField>
        <FormField label="Description">
          <input className={inputClass} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </FormField>
        <FormField label="Active">
          <select
            className={inputClass}
            value={form.active ? "true" : "false"}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === "true" }))}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </FormField>
      </FormModal>

      {created && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setCreated(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-theme-lg dark:bg-[var(--card)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="risk-factor-created-title"
          >
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 id="risk-factor-created-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                  Risk factor created
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-white/60">
                  Your risk factor was saved successfully.
                </p>
              </div>
            </div>
            <dl className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm dark:border-[var(--border)] dark:bg-white/5">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-white/55">Factor name</dt>
                <dd className="text-right font-medium text-gray-900 dark:text-white">{created.factorName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-white/55">Category</dt>
                <dd className="text-right font-medium text-gray-900 dark:text-white">{created.category}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-white/55">Weight</dt>
                <dd className="text-right font-medium text-gray-900 dark:text-white">{created.weight}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-white/55">Active</dt>
                <dd className="text-right font-medium text-gray-900 dark:text-white">
                  {created.active ? "Yes" : "No"}
                </dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={taBtnSecondary}
                onClick={() => {
                  setCreated(null);
                  openCreate();
                }}
              >
                Create another
              </button>
              <button type="button" className={taBtnPrimary} onClick={() => setCreated(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
