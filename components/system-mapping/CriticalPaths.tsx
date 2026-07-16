"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { GitBranch } from "lucide-react";
import { MappingFormField, mappingInputClass, SystemMappingModal } from "./SystemMappingModal";
import {
  AddMappingRecordButton,
  MappingEmpty,
  MappingError,
  MappingLoading,
  MappingRecordActions,
  MappingSectionHeader,
} from "./SystemMappingUi";
import type { CriticalPathRow } from "./types";

type CriticalPathForm = Omit<CriticalPathRow, "id" | "sourceOrder">;

const EMPTY_PATH: CriticalPathForm = {
  pathCode: "",
  name: "",
  upstreamSystems: "",
  downstreamSystems: "",
  coordinationRequirement: "",
  blackoutWindows: "",
  releaseManagerNotes: "",
};

/** Database-backed critical release paths with complete CRUD controls. */
export function CriticalPaths({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<CriticalPathRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CriticalPathRow | null | undefined>(undefined);
  const [form, setForm] = useState(EMPTY_PATH);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/system-mapping/critical-paths");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to load critical paths.");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load critical paths.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_PATH);
    setEditing(null);
    setFormError(null);
  };

  const openEdit = (item: CriticalPathRow) => {
    setForm({
      pathCode: item.pathCode,
      name: item.name,
      upstreamSystems: item.upstreamSystems,
      downstreamSystems: item.downstreamSystems,
      coordinationRequirement: item.coordinationRequirement,
      blackoutWindows: item.blackoutWindows,
      releaseManagerNotes: item.releaseManagerNotes,
    });
    setEditing(item);
    setFormError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, value.trim()]),
    ) as CriticalPathForm;
    if (Object.values(payload).some((value) => !value)) {
      setFormError("Complete every field.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch(
        editing ? `/api/system-mapping/critical-paths/${editing.id}` : "/api/system-mapping/critical-paths",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to save the critical path.");
      setEditing(undefined);
      await load();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save the critical path.");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (item: CriticalPathRow) => {
    if (!window.confirm(`Delete ${item.pathCode} — ${item.name}? This action cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/system-mapping/critical-paths/${item.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to delete the critical path.");
      await load();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to delete the critical path.");
    }
  };

  return (
    <section>
      <MappingSectionHeader
        icon={GitBranch}
        title="Critical Paths"
        description="Release sequences that need coordinated planning and protected windows."
        action={canEdit ? <AddMappingRecordButton label="Add critical path" onClick={openCreate} /> : undefined}
      />
      {loading ? (
        <MappingLoading label="Loading critical paths…" />
      ) : loadError ? (
        <MappingError message={loadError} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <MappingEmpty message="No critical paths have been recorded." />
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[var(--border)] dark:bg-[var(--card)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{item.pathCode}</p>
                  <h3 className="mt-1 text-base font-bold text-gray-900 dark:text-white">{item.name}</h3>
                </div>
                {canEdit && <MappingRecordActions label={item.pathCode} onEdit={() => openEdit(item)} onDelete={() => void remove(item)} />}
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <PathDetail label="Upstream systems" value={item.upstreamSystems} />
                <PathDetail label="Downstream systems" value={item.downstreamSystems} />
                <PathDetail label="Coordination requirement" value={item.coordinationRequirement} />
                <PathDetail label="Blackout windows" value={item.blackoutWindows} />
                <PathDetail label="Release manager notes" value={item.releaseManagerNotes} className="md:col-span-2" />
              </div>
            </article>
          ))}
        </div>
      )}

      <SystemMappingModal
        open={editing !== undefined}
        title={editing ? "Edit critical path" : "Add critical path"}
        submitting={submitting}
        error={formError}
        onClose={() => setEditing(undefined)}
        onSubmit={submit}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {(["pathCode", "name"] as const).map((key) => (
            <MappingFormField key={key} label={key === "pathCode" ? "Path code" : "Name"}>
              <input required value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className={mappingInputClass} />
            </MappingFormField>
          ))}
        </div>
        {(["upstreamSystems", "downstreamSystems", "coordinationRequirement", "blackoutWindows", "releaseManagerNotes"] as const).map((key) => (
          <MappingFormField key={key} label={{
            upstreamSystems: "Upstream systems",
            downstreamSystems: "Downstream systems",
            coordinationRequirement: "Coordination requirement",
            blackoutWindows: "Blackout windows",
            releaseManagerNotes: "Release manager notes",
          }[key]}>
            <textarea required rows={2} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className={mappingInputClass} />
          </MappingFormField>
        ))}
      </SystemMappingModal>
    </section>
  );
}

function PathDetail({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-gray-800 dark:text-gray-200">{value}</p>
    </div>
  );
}
