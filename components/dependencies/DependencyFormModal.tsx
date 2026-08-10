"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
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

type CreatedSummary = {
  id: string;
  depCode: string;
  releaseCode: string;
  dependsOnCode: string;
  dependencyType: string;
  status: string;
  impactIfBlocked: string;
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

function emptyForm(): DependencyFormValues {
  return {
    releaseId: "",
    dependsOnReleaseId: "",
    dependencyType: "Hard",
    status: "Pending",
    impactIfBlocked: "Release Delay",
    notes: "",
  };
}

/**
 * Modal to create or edit a ReleaseDependency between two releases.
 * After a successful create, shows a confirmation summary before closing.
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
      status: coerceEnum(initial?.status, DEPENDENCY_STATUSES, "Pending"),
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
  const [created, setCreated] = useState<CreatedSummary | null>(null);

  useEffect(() => {
    if (!open) {
      setCreated(null);
      return;
    }
    setForm(defaults);
    setError(null);
    setCreated(null);
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

    const result = await safeFetchJson<CreatedSummary & { error?: string }>(
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

    // Create gets an explicit confirmation; edit closes after refresh.
    if (!isEdit && result.data) {
      setCreated({
        id: result.data.id,
        depCode: result.data.depCode || "—",
        releaseCode: result.data.releaseCode || "—",
        dependsOnCode: result.data.dependsOnCode || "—",
        dependencyType: result.data.dependencyType || form.dependencyType,
        status: result.data.status || form.status,
        impactIfBlocked: result.data.impactIfBlocked || form.impactIfBlocked,
      });
      return;
    }

    onClose();
  };

  const releaseOptions = releases.map((r) => (
    <option key={r.id} value={r.id}>
      {r.releaseCode} — {r.name}
    </option>
  ));

  if (created) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div
          className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-theme-lg dark:bg-[var(--card)]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dependency-created-title"
        >
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 id="dependency-created-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                Dependency created
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-white/60">
                Your dependency was saved successfully.
              </p>
            </div>
          </div>

          <dl className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm dark:border-[var(--border)] dark:bg-white/5">
            <SummaryRow label="Dep ID" value={created.depCode} mono />
            <SummaryRow label="Release" value={created.releaseCode} mono />
            <SummaryRow label="Depends on" value={created.dependsOnCode} mono />
            <SummaryRow label="Type" value={created.dependencyType} />
            <SummaryRow label="Status" value={created.status} />
            <SummaryRow label="Impact if blocked" value={created.impactIfBlocked} />
          </dl>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={taBtnSecondary}
              onClick={() => {
                setCreated(null);
                setForm(emptyForm());
                setError(null);
              }}
            >
              Create another
            </button>
            <ProgressLink
              href={`/dependencies/${created.id}`}
              className={cn(taBtnSecondary, "inline-flex items-center")}
            >
              View dependency
            </ProgressLink>
            <button type="button" className={taBtnPrimary} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

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

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500 dark:text-white/55">{label}</dt>
      <dd className={cn("text-right font-medium text-gray-900 dark:text-white", mono && "font-mono text-xs")}>
        {value}
      </dd>
    </div>
  );
}
