"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Grid3X3 } from "lucide-react";
import { MappingError, MappingLoading, MappingSectionHeader } from "./SystemMappingUi";
import { MappingFormField, mappingInputClass, SystemMappingModal } from "./SystemMappingModal";
import type { DepartmentMatrixRow } from "./types";

const DEPARTMENTS = ["Finance", "HR", "IT", "CRM", "Manufacturing", "Logistics", "Legal", "Security"] as const;
const MATRIX_VALUES = ["Primary", "Secondary", "None"] as const;
type MatrixValue = (typeof MATRIX_VALUES)[number];
type MatrixEdit = { fromDepartment: string; toDepartment: string; value: MatrixValue; mirror: boolean };

function departmentKey(department: string): keyof Omit<DepartmentMatrixRow, "id" | "fromDepartment"> {
  return department.toLowerCase() as keyof Omit<DepartmentMatrixRow, "id" | "fromDepartment">;
}

function normalizeValue(value: string): MatrixValue {
  const normalized = value.trim().toLowerCase();
  if (normalized === "●" || normalized.includes("primary")) return "Primary";
  if (normalized === "○" || normalized.includes("secondary")) return "Secondary";
  return "None";
}

function valueSymbol(value: string) {
  const normalized = normalizeValue(value);
  if (normalized === "Primary") return <span className="text-lg font-black text-brand-600 dark:text-brand-400">●</span>;
  if (normalized === "Secondary") return <span className="text-lg font-black text-brand-500 dark:text-brand-300">○</span>;
  return <span className="text-gray-300 dark:text-gray-600">—</span>;
}

/** Exact editable 8×8 department relationship matrix. */
export function DepartmentMatrix({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<DepartmentMatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<MatrixEdit | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/system-mapping/matrix");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to load the department matrix.");
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the department matrix.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rowsByDepartment = useMemo(
    () => new Map(rows.map((row) => [row.fromDepartment.toLowerCase(), row])),
    [rows],
  );

  const openEditor = (fromDepartment: string, toDepartment: string, value: string) => {
    if (!canEdit) return;
    setEdit({ fromDepartment, toDepartment, value: normalizeValue(value), mirror: true });
    setFormError(null);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!edit) return;
    const value = edit.value === "Primary" ? "●" : edit.value === "Secondary" ? "○" : "-";
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch("/api/system-mapping/matrix", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...edit, value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to update the relationship.");
      setEdit(null);
      await load();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Unable to update the relationship.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <MappingSectionHeader
        icon={Grid3X3}
        title="Department Matrix"
        description={canEdit ? "Select a non-diagonal relationship to update it." : "Cross-department relationship strength."}
      />
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-[var(--border)] dark:bg-white/5 dark:text-gray-300">
        <span><strong className="text-brand-600 dark:text-brand-400">●</strong> Primary</span>
        <span><strong className="text-brand-500 dark:text-brand-300">○</strong> Secondary</span>
        <span><strong className="text-gray-400">—</strong> None</span>
        <span className="text-gray-400">Diagonal cells are not editable.</span>
      </div>
      {loading ? (
        <MappingLoading label="Loading matrix…" />
      ) : error ? (
        <MappingError message={error} onRetry={() => void load()} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-[var(--border)] dark:bg-[var(--card)]">
          <table className="min-w-[860px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-[var(--border)] dark:bg-white/5">
                <th className="sticky left-0 z-20 bg-gray-50 px-3 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-600 dark:bg-[var(--card)] dark:text-gray-300">
                  From \ To
                </th>
                {DEPARTMENTS.map((department) => (
                  <th key={department} scope="col" className="px-3 py-3 text-center text-xs font-bold text-gray-600 dark:text-gray-300">
                    {department}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEPARTMENTS.map((fromDepartment) => {
                const row = rowsByDepartment.get(fromDepartment.toLowerCase());
                return (
                  <tr key={fromDepartment} className="border-b border-gray-200 last:border-b-0 dark:border-[var(--border)]">
                    <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-3 text-left font-semibold text-gray-900 dark:bg-[var(--card)] dark:text-white">
                      {fromDepartment}
                    </th>
                    {DEPARTMENTS.map((toDepartment) => {
                      const diagonal = fromDepartment === toDepartment;
                      const value = row?.[departmentKey(toDepartment)] ?? "None";
                      return (
                        <td key={toDepartment} className="px-2 py-2 text-center">
                          {diagonal ? (
                            <span className="inline-flex h-10 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-300 dark:bg-white/5 dark:text-gray-600" aria-label="Not applicable">×</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openEditor(fromDepartment, toDepartment, value)}
                              disabled={!canEdit}
                              className="inline-flex h-10 w-12 items-center justify-center rounded-lg transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-brand-500/10"
                              aria-label={`${fromDepartment} to ${toDepartment}: ${normalizeValue(value)}${canEdit ? ". Edit relationship" : ""}`}
                            >
                              {valueSymbol(value)}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SystemMappingModal
        open={Boolean(edit)}
        title={edit ? `${edit.fromDepartment} → ${edit.toDepartment}` : "Edit relationship"}
        submitting={submitting}
        error={formError}
        onClose={() => setEdit(null)}
        onSubmit={save}
      >
        {edit && (
          <>
            <MappingFormField label="Relationship">
              <select
                value={edit.value}
                onChange={(event) => setEdit((current) => current ? { ...current, value: event.target.value as MatrixValue } : current)}
                className={mappingInputClass}
              >
                {MATRIX_VALUES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </MappingFormField>
            <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-[var(--border)]">
              <input
                type="checkbox"
                checked={edit.mirror}
                onChange={(event) => setEdit((current) => current ? { ...current, mirror: event.target.checked } : current)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span>
                <span className="block text-sm font-semibold text-gray-800 dark:text-gray-200">Mirror reverse direction</span>
                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">Also update {edit.toDepartment} → {edit.fromDepartment}.</span>
              </span>
            </label>
          </>
        )}
      </SystemMappingModal>
    </section>
  );
}
