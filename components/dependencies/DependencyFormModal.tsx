"use client";

import { useEffect, useMemo, useState } from "react";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { safeFetchJson } from "@/lib/safe-fetch";
import {
  DEPENDENCY_IMPACTS,
  DEPENDENCY_STATUSES,
  DEPENDENCY_TYPES,
} from "@/lib/validation/dependency";

type ReleaseOption = { id: string; releaseCode: string; name: string };

export type DependencyFormValues = {
  releaseId: string;
  dependsOnReleaseId: string;
  dependencyType: (typeof DEPENDENCY_TYPES)[number];
  status: (typeof DEPENDENCY_STATUSES)[number];
  impactIfBlocked: (typeof DEPENDENCY_IMPACTS)[number];
  notes: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after successful create or update. */
  onSaved: () => void;
  /** When set, modal PATCHes this dependency instead of creating. */
  editId?: string | null;
  initial?: Partial<DependencyFormValues> | null;
  /** Shown in edit title, e.g. DEP-027 */
  depCode?: string | null;
};

function coerceEnum<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}

/**
 * Modal to create or edit a ReleaseDependency between two releases.
 */
export function DependencyFormModal({
  open,
  onClose,
  onSaved,
  editId,
  initial,
  depCode,
}: Props) {
  const isEdit = Boolean(editId);

  const defaults = useMemo<DependencyFormValues>(
    () => ({
      releaseId: initial?.releaseId ?? "",
      dependsOnReleaseId: initial?.dependsOnReleaseId ?? "",
      dependencyType: coerceEnum(initial?.dependencyType, DEPENDENCY_TYPES, "Hard"),
      status: coerceEnum(initial?.status, DEPENDENCY_STATUSES, "Clear"),
      impactIfBlocked: coerceEnum(initial?.impactIfBlocked, DEPENDENCY_IMPACTS, "Release Delay"),
      notes: initial?.notes ?? "",
    }),
    [initial]
  );

  const [form, setForm] = useState(defaults);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(defaults);
    setError(null);
    setLoadingReleases(true);
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<{ id: string; releaseCode: string; name: string }[]>(
        "/api/releases",
        { signal: ac.signal, label: "dep-form-releases" }
      );
      if (ac.signal.aborted) return;
      setLoadingReleases(false);
      if (!result.ok) {
        setError("Could not load releases");
        return;
      }
      const list = (result.data ?? [])
        .map((r) => ({ id: r.id, releaseCode: r.releaseCode, name: r.name }))
        .sort((a, b) => a.releaseCode.localeCompare(b.releaseCode));
      setReleases(list);
    })();
    return () => ac.abort();
  }, [open, defaults]);

  if (!open) return null;

  const set =
    (key: keyof DependencyFormValues) =>
    (value: string) =>
      setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.releaseId === form.dependsOnReleaseId) {
      setError("A release cannot depend on itself");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      releaseId: form.releaseId,
      dependsOnReleaseId: form.dependsOnReleaseId,
      dependencyType: form.dependencyType,
      status: form.status,
      impactIfBlocked: form.impactIfBlocked,
      notes: form.notes.trim() ? form.notes.trim() : null,
    };

    const result = await safeFetchJson(
      isEdit ? `/api/dependencies/${editId}` : "/api/dependencies",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        label: isEdit ? "update-dependency" : "create-dependency",
        rejectHttpErrors: false,
      }
    );
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      const data = result.ok ? result.data : null;
      const msg =
        data && typeof data === "object" && data !== null && "error" in data
          ? String((data as { error?: string }).error)
          : isEdit
            ? "Failed to update dependency"
            : "Failed to create dependency";
      setError(msg);
      return;
    }
    onSaved();
    onClose();
  };

  const releaseOptions = releases.map((r) => (
    <option key={r.id} value={r.id}>
      {r.releaseCode} — {r.name}
    </option>
  ));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-[var(--card)]">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? `Edit ${depCode ?? "Dependency"}` : "New Dependency"}
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-white/55">
            {isEdit
              ? "Update type, status, impact, notes, or linked releases."
              : "Link a release to another release it depends on. Dep ID is assigned automatically."}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Release
            <select
              className={cn(taInput, "mt-1")}
              value={form.releaseId}
              onChange={(e) => set("releaseId")(e.target.value)}
              required
              disabled={loadingReleases}
            >
              <option value="">{loadingReleases ? "Loading…" : "Select release…"}</option>
              {releaseOptions}
            </select>
          </label>

          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Depends on release
            <select
              className={cn(taInput, "mt-1")}
              value={form.dependsOnReleaseId}
              onChange={(e) => set("dependsOnReleaseId")(e.target.value)}
              required
              disabled={loadingReleases}
            >
              <option value="">{loadingReleases ? "Loading…" : "Select upstream release…"}</option>
              {releaseOptions}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
              Type
              <select
                className={cn(taInput, "mt-1")}
                value={form.dependencyType}
                onChange={(e) => set("dependencyType")(e.target.value)}
                required
              >
                {DEPENDENCY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
              Status
              <select
                className={cn(taInput, "mt-1")}
                value={form.status}
                onChange={(e) => set("status")(e.target.value)}
                required
              >
                {DEPENDENCY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Impact if blocked
            <select
              className={cn(taInput, "mt-1")}
              value={form.impactIfBlocked}
              onChange={(e) => set("impactIfBlocked")(e.target.value)}
              required
            >
              {DEPENDENCY_IMPACTS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Notes (optional)
            <textarea
              className={cn(taInput, "mt-1 min-h-[72px]")}
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
              maxLength={4000}
            />
          </label>

          {error && <p className="text-sm text-error-600 dark:text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={taBtnPrimary} disabled={saving || loadingReleases}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create dependency"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
