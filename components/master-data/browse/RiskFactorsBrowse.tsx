"use client";

/**
 * Risk Factors master list — grouped by category so factors are easy to scan.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Layers, Pencil, Trash2 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { type SortDir } from "@/lib/master-data/table-utils";
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
import { cn } from "@/lib/utils";
import {
  apiJson,
  FormField,
  FormModal,
  inputClass,
  MasterDataEmptyState,
  MasterDataError,
  MasterDataLoading,
  MasterDataTableShell,
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

type FormState = {
  category: string;
  factorName: string;
  weight: string;
  description: string;
  active: boolean;
};
const emptyForm: FormState = {
  category: "",
  factorName: "",
  weight: "",
  description: "",
  active: true,
};

type SortKey = "category" | "factorName" | "weight";

type CategoryGroup = {
  category: string;
  factors: RiskFactorRow[];
  weightSum: number;
  activeCount: number;
};

function compareFactors(a: RiskFactorRow, b: RiskFactorRow, sortKey: SortKey, sortDir: SortDir) {
  const dir = sortDir === "desc" ? -1 : 1;
  if (sortKey === "weight") return (a.weight - b.weight) * dir;
  if (sortKey === "factorName") return a.factorName.localeCompare(b.factorName) * dir;
  return a.factorName.localeCompare(b.factorName) * dir;
}

/**
 * Browse / edit weighted risk factors, presented as category sections.
 */
export function RiskFactorsBrowse() {
  const { values, setFilter, setSort, clearAll, hasActive, apiQuery } = useTableFilters(RISK_FACTORS_FILTER_SCHEMA);
  const [rows, setRows] = useState<RiskFactorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const search = values.q;
  const sortKey = (values.sort || "category") as SortKey;
  const sortDir = (values.sortDir || "asc") as SortDir;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RiskFactorRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<RiskFactorRow | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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

  const groups = useMemo((): CategoryGroup[] => {
    const map = new Map<string, RiskFactorRow[]>();
    for (const row of rows) {
      const key = row.category?.trim() || "Uncategorized";
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    const categoryNames = [...map.keys()].sort((a, b) => {
      const dir = sortDir === "desc" && sortKey === "category" ? -1 : 1;
      return a.localeCompare(b) * (sortKey === "category" ? dir : 1);
    });
    return categoryNames.map((category) => {
      const factors = [...(map.get(category) ?? [])].sort((a, b) =>
        compareFactors(a, b, sortKey === "category" ? "factorName" : sortKey, sortDir)
      );
      return {
        category,
        factors,
        weightSum: factors.reduce((s, f) => s + (f.active ? f.weight : 0), 0),
        activeCount: factors.filter((f) => f.active).length,
      };
    });
  }, [rows, sortKey, sortDir]);

  const categoryOptions = useMemo(
    () => [...new Set(rows.map((r) => r.category).filter(Boolean))].sort(),
    [rows]
  );

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } =
    useTablePagePreferences("risk-factors", RISK_FACTOR_COLUMNS, RISK_FACTOR_FILTER_FIELDS, {
      lockedKeys: ["factorName", "actions"],
      defaultHiddenFilters: RISK_FACTOR_DEFAULT_HIDDEN_FILTER_KEYS,
      defaultHiddenColumns: RISK_FACTOR_DEFAULT_HIDDEN_COLUMN_KEYS,
    });

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  const toggleCollapse = (category: string) => {
    setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const expandAll = () => setCollapsed({});
  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const g of groups) next[g.category] = true;
    setCollapsed(next);
  };

  const openCreate = (presetCategory?: string) => {
    setEditing(null);
    setCreated(null);
    setForm({ ...emptyForm, category: presetCategory ?? "" });
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
      <div className="mb-2 flex items-center justify-between gap-4">
        <TopBar
          pageKey="risk-factors"
          title="Risk Factors"
          subtitle={`${rows.length} factors in ${groups.length} categor${groups.length === 1 ? "y" : "ies"}`}
          className="mb-0 flex-1"
        />
        <div className="flex shrink-0 items-center gap-2">
          <PageDocumentation pageKey="risk-factors" />
          <button
            type="button"
            onClick={() => openCreate()}
            className="shrink-0 rounded-lg bg-[#2548C9] px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-[#1E3A9F]"
          >
            Add Risk Factor
          </button>
        </div>
      </div>

      <p className="mb-4 text-[13px] text-gray-500 dark:text-white/55">
        Master list of weighted scoring factors for release Weighted Risk Score. Active weights sum
        to{" "}
        <strong className="text-gray-800 dark:text-white/85">{activeWeightSum.toFixed(3)}</strong>{" "}
        (source formula rounding — not exactly 1.0).
      </p>

      {error && <MasterDataError message={error} onRetry={load} />}

      <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
        {isFilterVisible("category") && (
          <FilterSelect value={values.category} onChange={(v) => setFilter("category", v)}>
            <option value="">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
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
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Weight
            </span>
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

      <MasterDataTableShell
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TablePageToolbar
              columnPicker={columnPicker}
              presets={RISK_FACTOR_SORT_PRESETS}
              sortKey={sortKey}
              sortDir={sortDir}
              onSelectSort={setSort}
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setFilter("q", e.target.value)}
                placeholder="Search factors…"
                className="h-9 w-44 rounded-lg border border-gray-200 bg-white px-3 text-[13px] dark:border-[var(--border)] dark:bg-[var(--card)] dark:text-white"
              />
              <button type="button" className={cn(taBtnSecondary, "h-9 px-3 text-[12px]")} onClick={expandAll}>
                Expand all
              </button>
              <button type="button" className={cn(taBtnSecondary, "h-9 px-3 text-[12px]")} onClick={collapseAll}>
                Collapse all
              </button>
            </div>
          </div>
        }
      >
        {tablePending ? (
          <MasterDataLoading columns={4} />
        ) : rows.length === 0 ? (
          <MasterDataEmptyState
            entityLabel="risk factors"
            addLabel="Add Risk Factor"
            onAdd={() => openCreate()}
          />
        ) : (
          <div className="flex min-h-[calc(100dvh-11rem)] flex-col gap-3 p-3 sm:p-4">
            {groups.length > 1 && (
              <div className="flex flex-wrap gap-2 pb-1">
                {groups.map((g) => (
                  <a
                    key={g.category}
                    href={`#rf-cat-${encodeURIComponent(g.category)}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:border-brand-300 hover:bg-brand-50 dark:border-[var(--border)] dark:bg-white/5 dark:text-white/75 dark:hover:bg-brand-500/10"
                  >
                    <Layers className="h-3 w-3 opacity-60" aria-hidden />
                    {g.category}
                    <span className="tabular-nums text-slate-400 dark:text-white/40">
                      {g.factors.length}
                    </span>
                  </a>
                ))}
              </div>
            )}

            <div className="flex flex-1 flex-col gap-3">
            {groups.map((group) => {
              const isCollapsed = !!collapsed[group.category];
              return (
                <section
                  key={group.category}
                  id={`rf-cat-${encodeURIComponent(group.category)}`}
                  className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-[var(--border)]"
                >
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/90 px-3 py-2.5 dark:border-[var(--border)] dark:bg-white/[0.04] sm:px-4">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(group.category)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-expanded={!isCollapsed}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      )}
                      <span className="truncate text-[15px] font-bold text-slate-900 dark:text-white">
                        {group.category}
                      </span>
                      <span className="shrink-0 rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200 dark:bg-white/10 dark:text-white/70 dark:ring-white/10">
                        {group.factors.length} factor{group.factors.length === 1 ? "" : "s"}
                      </span>
                      <span className="hidden text-[12px] text-slate-500 sm:inline dark:text-white/45">
                        {group.activeCount} active · weight {group.weightSum.toFixed(3)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={cn(taBtnSecondary, "h-8 px-2.5 text-[12px]")}
                      onClick={() => openCreate(group.category)}
                    >
                      Add in category
                    </button>
                  </div>

                  {isCollapsed ? (
                    <div className="flex flex-wrap gap-1.5 px-3 py-3 sm:px-4">
                      {group.factors.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => openEdit(f)}
                          className={cn(
                            "rounded-md px-2 py-1 text-[12px] font-medium ring-1 transition",
                            f.active
                              ? "bg-white text-slate-700 ring-slate-200 hover:ring-brand-300 dark:bg-white/5 dark:text-white/80 dark:ring-white/10"
                              : "bg-slate-100 text-slate-400 ring-slate-200 dark:bg-white/[0.03] dark:text-white/35 dark:ring-white/5"
                          )}
                          title={`${f.factorName} · weight ${f.weight}`}
                        >
                          {f.factorName}
                          <span className="ml-1 tabular-nums text-slate-400 dark:text-white/35">
                            {f.weight}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-white/10">
                            {isColumnVisible("factorName") && (
                              <th className="px-4 py-2 font-semibold">Factor</th>
                            )}
                            {isColumnVisible("weight") && (
                              <th className="px-3 py-2 font-semibold">Weight</th>
                            )}
                            {isColumnVisible("description") && (
                              <th className="px-3 py-2 font-semibold">Description</th>
                            )}
                            {isColumnVisible("active") && (
                              <th className="px-3 py-2 font-semibold">Status</th>
                            )}
                            <th className="px-3 py-2 text-right font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.factors.map((row) => (
                            <tr
                              key={row.id}
                              className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/80 dark:border-white/5 dark:hover:bg-white/[0.03]"
                            >
                              {isColumnVisible("factorName") && (
                                <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">
                                  {row.factorName}
                                </td>
                              )}
                              {isColumnVisible("weight") && (
                                <td className="px-3 py-2.5 tabular-nums text-slate-700 dark:text-white/80">
                                  {row.weight}
                                </td>
                              )}
                              {isColumnVisible("description") && (
                                <td
                                  className="max-w-[280px] truncate px-3 py-2.5 text-slate-500 dark:text-white/50"
                                  title={row.description ?? ""}
                                >
                                  {row.description || "—"}
                                </td>
                              )}
                              {isColumnVisible("active") && (
                                <td className="px-3 py-2.5">
                                  <button
                                    type="button"
                                    onClick={() => void toggleActive(row)}
                                    className={cn(
                                      "rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
                                      row.active
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                                        : "border-gray-200 bg-gray-50 text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-white/45"
                                    )}
                                  >
                                    {row.active ? "Active" : "Inactive"}
                                  </button>
                                </td>
                              )}
                              <td className="px-3 py-2.5 text-right">
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    className={cn(
                                      taBtnSecondary,
                                      "inline-flex h-8 items-center gap-1 px-2.5 text-[12px]"
                                    )}
                                    onClick={() => openEdit(row)}
                                    aria-label={`Edit ${row.factorName}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className={cn(
                                      taBtnSecondary,
                                      "inline-flex h-8 items-center gap-1 px-2.5 text-[12px] text-rose-700 dark:text-rose-300"
                                    )}
                                    onClick={() => void handleDelete(row)}
                                    aria-label={`Delete ${row.factorName}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}
            </div>
          </div>
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
          <input
            className={inputClass}
            list="risk-factor-category-options"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="e.g. Business Criticality"
          />
          <datalist id="risk-factor-category-options">
            {categoryOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Factor Name" required>
          <input
            className={inputClass}
            value={form.factorName}
            onChange={(e) => setForm((f) => ({ ...f, factorName: e.target.value }))}
          />
        </FormField>
        <FormField label="Weight" required>
          <input
            type="number"
            step="0.001"
            className={inputClass}
            value={form.weight}
            onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
          />
        </FormField>
        <FormField label="Description">
          <input
            className={inputClass}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
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
                <h2
                  id="risk-factor-created-title"
                  className="text-lg font-semibold text-gray-900 dark:text-white"
                >
                  Risk factor created
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-white/60">
                  Saved under category {created.category}.
                </p>
              </div>
            </div>
            <dl className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm dark:border-[var(--border)] dark:bg-white/5">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-white/55">Factor name</dt>
                <dd className="text-right font-medium text-gray-900 dark:text-white">
                  {created.factorName}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-white/55">Category</dt>
                <dd className="text-right font-medium text-gray-900 dark:text-white">
                  {created.category}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-white/55">Weight</dt>
                <dd className="text-right font-medium text-gray-900 dark:text-white">
                  {created.weight}
                </dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={taBtnSecondary}
                onClick={() => {
                  setCreated(null);
                  openCreate(created.category);
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
