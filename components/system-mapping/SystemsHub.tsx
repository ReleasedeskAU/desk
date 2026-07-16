"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Boxes, Network } from "lucide-react";
import { MappingFormField, mappingInputClass, SystemMappingModal } from "./SystemMappingModal";
import {
  AddMappingRecordButton,
  MappingEmpty,
  MappingError,
  MappingLoading,
  MappingRecordActions,
  MappingSectionHeader,
} from "./SystemMappingUi";
import type { SystemRow } from "./types";

type SystemForm = Omit<SystemRow, "id" | "sourceOrder">;

const EMPTY_SYSTEM: SystemForm = {
  system: "",
  department: "",
  type: "",
  integratesWith: "",
  dataFlow: "",
  keyDataExchanged: "",
};

/** Database-backed systems catalog with complete CRUD controls. */
export function SystemsHub({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<SystemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SystemRow | null | undefined>(undefined);
  const [form, setForm] = useState(EMPTY_SYSTEM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/system-mapping/systems");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to load systems.");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load systems.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_SYSTEM);
    setEditing(null);
    setFormError(null);
  };

  const openEdit = (item: SystemRow) => {
    setForm({
      system: item.system,
      department: item.department,
      type: item.type,
      integratesWith: item.integratesWith,
      dataFlow: item.dataFlow,
      keyDataExchanged: item.keyDataExchanged,
    });
    setEditing(item);
    setFormError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      ...form,
      system: form.system.trim(),
      department: form.department.trim(),
      type: form.type.trim(),
      integratesWith: form.integratesWith.trim(),
      dataFlow: form.dataFlow.trim(),
      keyDataExchanged: form.keyDataExchanged.trim(),
    };
    if (Object.values(payload).some((value) => !value)) {
      setFormError("Complete every field.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch(
        editing ? `/api/system-mapping/systems/${editing.id}` : "/api/system-mapping/systems",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to save the system.");
      setEditing(undefined);
      await load();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save the system.");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (item: SystemRow) => {
    if (!window.confirm(`Delete ${item.system}? This action cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/system-mapping/systems/${item.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to delete the system.");
      await load();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to delete the system.");
    }
  };

  return (
    <section>
      <MappingSectionHeader
        icon={Boxes}
        title="Systems Hub"
        description="Applications, ownership, integration reach, and exchanged data."
        action={canEdit ? <AddMappingRecordButton label="Add system" onClick={openCreate} /> : undefined}
      />
      {loading ? (
        <MappingLoading label="Loading systems…" />
      ) : loadError ? (
        <MappingError message={loadError} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <MappingEmpty message="No systems have been mapped yet." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[var(--border)] dark:bg-[var(--card)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-gray-900 dark:text-white">{item.system}</h3>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-brand-50 px-2 py-1 font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{item.department}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">{item.type}</span>
                  </div>
                </div>
                {canEdit && <MappingRecordActions label={item.system} onEdit={() => openEdit(item)} onDelete={() => void remove(item)} />}
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Integrates with</dt>
                  <dd className="mt-1 text-gray-800 dark:text-gray-200">{item.integratesWith}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Data flow</dt>
                  <dd className="mt-1 text-gray-800 dark:text-gray-200">{item.dataFlow}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400"><Network className="h-3.5 w-3.5" />Key data exchanged</dt>
                  <dd className="mt-1 text-gray-800 dark:text-gray-200">{item.keyDataExchanged}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}

      <SystemMappingModal
        open={editing !== undefined}
        title={editing ? "Edit system" : "Add system"}
        submitting={submitting}
        error={formError}
        onClose={() => setEditing(undefined)}
        onSubmit={submit}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {(["system", "department", "type", "integratesWith", "dataFlow", "keyDataExchanged"] as const).map((key) => (
            <MappingFormField key={key} label={{
              system: "System",
              department: "Department",
              type: "Type",
              integratesWith: "Integrates with",
              dataFlow: "Data flow",
              keyDataExchanged: "Key data exchanged",
            }[key]}>
              <input
                required
                value={form[key]}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                className={mappingInputClass}
              />
            </MappingFormField>
          ))}
        </div>
      </SystemMappingModal>
    </section>
  );
}
