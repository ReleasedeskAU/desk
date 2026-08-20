"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CreateConfirmation,
  CreateModalShell,
  RequiredMark,
  SummaryRow,
} from "@/components/create-flow/CreateFlowUi";
import { SearchableSelect } from "@/components/ui/searchable-multi-select";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import { buildFormSaveAlert } from "@/lib/form-save-alert";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { safeFetchJson } from "@/lib/safe-fetch";
import { useEntityLifecycleStatuses } from "@/hooks/useEntityLifecycleStatuses";
import { DEPENDENCY_IMPACTS, DEPENDENCY_TYPES } from "@/lib/validation/dependency";

type ReleaseOption = { id: string; releaseCode: string; name: string };

export type DependencyFormValues = {
  releaseId: string;
  dependsOnReleaseId: string;
  dependencyType: (typeof DEPENDENCY_TYPES)[number];
  status: string;
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
  /** Enabled lifecycle status labels from parent (SSOT). Falls back to hook. */
  statusOptions?: string[];
  /** Default create status from lifecycle config. */
  defaultStatus?: string;
  /** When set, the "from" release is fixed (Release detail add). */
  lockReleaseId?: string;
};

function coerceEnum<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
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
  statusOptions: statusOptionsProp,
  defaultStatus: defaultStatusProp,
  lockReleaseId,
}: Props) {
  const isEdit = Boolean(editId);
  const lifecycle = useEntityLifecycleStatuses("/api/dependency-lifecycle-config");
  const createOptions =
    statusOptionsProp && statusOptionsProp.length > 0
      ? statusOptionsProp
      : lifecycle.createOptions;
  const defaultStatus = defaultStatusProp || lifecycle.defaultStatus || "Pending";
  const scoped = Boolean(lockReleaseId);

  const defaults = useMemo<DependencyFormValues>(() => {
    const statusFallback = defaultStatus;
    const initialStatus = initial?.status?.trim();
    return {
      releaseId: lockReleaseId || initial?.releaseId || "",
      dependsOnReleaseId: initial?.dependsOnReleaseId ?? "",
      dependencyType: coerceEnum(initial?.dependencyType, DEPENDENCY_TYPES, "Hard"),
      status:
        initialStatus &&
        (createOptions.length === 0 || createOptions.includes(initialStatus) || isEdit)
          ? initialStatus
          : statusFallback,
      impactIfBlocked: coerceEnum(initial?.impactIfBlocked, DEPENDENCY_IMPACTS, "Release Delay"),
      notes: initial?.notes ?? "",
    };
  }, [initial, defaultStatus, createOptions, isEdit, lockReleaseId]);

  const [form, setForm] = useState(defaults);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedSummary | null>(null);

  const statusSelectOptions = useMemo(() => {
    const base = createOptions.length > 0 ? createOptions : [defaultStatus].filter(Boolean);
    return [...new Set([...base, form.status].filter(Boolean))];
  }, [createOptions, defaultStatus, form.status]);

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
  }, [open]);

  useEffect(() => {
    if (!open || isEdit || createOptions.length === 0) return;
    setForm((prev) => {
      if (createOptions.includes(prev.status)) return prev;
      return { ...prev, status: defaultStatus || createOptions[0]! };
    });
  }, [open, isEdit, createOptions, defaultStatus]);

  const lockedRelease = releases.find((item) => item.id === form.releaseId);
  const upstreamOptions = useMemo(
    () =>
      releases
        .filter((item) => item.id !== form.releaseId)
        .map((item) => ({
          value: item.id,
          label: `${item.releaseCode} — ${item.name}`,
        })),
    [releases, form.releaseId]
  );

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

  if (created) {
    return (
      <CreateConfirmation
        entity="Dependency"
        viewHref={`/dependencies/${created.id}`}
        onClose={onClose}
        onCreateAnother={() => {
          setCreated(null);
          setForm({
            releaseId: lockReleaseId || "",
            dependsOnReleaseId: "",
            dependencyType: "Hard",
            status: defaultStatus,
            impactIfBlocked: "Release Delay",
            notes: "",
          });
          setError(null);
        }}
      >
        <SummaryRow label="Dep ID" value={created.depCode} mono />
        <SummaryRow label="Release" value={created.releaseCode} mono />
        <SummaryRow label="Depends on" value={created.dependsOnCode} mono />
        <SummaryRow label="Type" value={created.dependencyType} />
        <SummaryRow label="Status" value={created.status} />
        <SummaryRow label="Impact if blocked" value={created.impactIfBlocked} />
      </CreateConfirmation>
    );
  }

  return (
    <>
      <CreateModalShell
        title={isEdit ? `Edit ${depCode ?? "Dependency"}` : "New Dependency"}
        description={
          scoped
            ? "This release depends on another. Dep ID is assigned automatically."
            : "Link a release to another release it depends on. Dep ID is assigned automatically."
        }
        onClose={onClose}
        footer={
          <>
            <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              form="dependency-create-form"
              className={taBtnPrimary}
              disabled={saving || loadingReleases}
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create dependency"}
            </button>
          </>
        }
      >
        <form id="dependency-create-form" onSubmit={submit} className="min-w-0 space-y-4">
          {scoped ? (
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600 dark:bg-white/5 dark:text-white/70">
              <p className="font-medium text-slate-800 dark:text-white">
                {lockedRelease
                  ? `${lockedRelease.releaseCode} — ${lockedRelease.name}`
                  : "Loading release…"}
              </p>
            </div>
          ) : (
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Release
              <RequiredMark />
              <div className="mt-1">
                <SearchableSelect
                  value={form.releaseId}
                  onChange={(value) => {
                    setForm((prev) => ({
                      ...prev,
                      releaseId: value,
                      dependsOnReleaseId: prev.dependsOnReleaseId === value ? "" : prev.dependsOnReleaseId,
                    }));
                  }}
                  options={releases.map((item) => ({
                    value: item.id,
                    label: `${item.releaseCode} — ${item.name}`,
                  }))}
                  placeholder={loadingReleases ? "Loading…" : "Select release…"}
                  disabled={loadingReleases}
                  allowClear={false}
                />
              </div>
            </label>
          )}

          <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
            Depends on release
            <RequiredMark />
            <div className="mt-1">
              <SearchableSelect
                value={form.dependsOnReleaseId}
                onChange={set("dependsOnReleaseId")}
                options={upstreamOptions}
                placeholder={loadingReleases ? "Loading…" : "Select upstream release…"}
                disabled={loadingReleases || (!scoped && !form.releaseId)}
                allowClear={false}
              />
            </div>
          </label>

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Type
              <RequiredMark />
              <select
                className={cn(taInput, "mt-1 min-w-0 max-w-full")}
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
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Status
              <RequiredMark />
              <select
                className={cn(taInput, "mt-1 min-w-0 max-w-full")}
                value={form.status}
                onChange={(e) => set("status")(e.target.value)}
                required
              >
                {statusSelectOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
            Impact if blocked
            <RequiredMark />
            <select
              className={cn(taInput, "mt-1 min-w-0 max-w-full")}
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

          <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
            Notes (optional)
            <textarea
              className={cn(taInput, "mt-1 min-h-[64px] min-w-0 max-w-full")}
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
              maxLength={4000}
            />
          </label>
        </form>
      </CreateModalShell>
      <FormAlertDialog
        alert={error ? buildFormSaveAlert(null, error, { entityLabel: "dependency" }) : null}
        onDismiss={() => setError(null)}
      />
    </>
  );
}
