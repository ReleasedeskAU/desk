"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2 } from "lucide-react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { SearchableSelect } from "@/components/ui/searchable-multi-select";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import { buildFormSaveAlert } from "@/lib/form-save-alert";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { safeFetchJson } from "@/lib/safe-fetch";
import { BLOCKER_CATEGORIES } from "@/lib/blocker-categories";

const BLOCKER_TYPES = BLOCKER_CATEGORIES;

const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;
const ESCALATIONS = ["L1 - Team Lead", "L2 - Manager", "L3 - Director"] as const;

type ReleaseOption = {
  id: string;
  releaseCode: string;
  name: string;
  departmentName?: string;
  applicationName?: string;
};

type CreatedSummary = {
  id: string;
  blockerCode: string;
  releaseCode: string;
  releaseName: string;
  blockerType: string;
  severity: string;
  status: string;
  impactOnRelease: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after successful create (list refresh). */
  onCreated: () => void;
  /**
   * When set, release is locked (release-detail create).
   * When omitted, the modal shows a release picker (blockers list create).
   */
  releaseCode?: string;
  releaseName?: string;
  departmentName?: string;
  applicationName?: string;
  raisedByDefault?: string;
  /** Enabled default status from blocker lifecycle config. */
  defaultStatus?: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const fieldClass = cn(taInput, "mt-1 min-w-0 max-w-full");

/** Overlay + dialog chrome — always on the viewport, never clipped by page overflow. */
function BlockerModalFrame({
  children,
  labelledBy,
  onClose,
  compact = false,
}: {
  children: React.ReactNode;
  labelledBy: string;
  onClose: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-x-hidden overflow-y-auto bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "my-auto flex w-full min-w-0 flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-[var(--card)]",
          compact
            ? "max-h-[min(90dvh,40rem)] max-w-lg"
            : "max-h-[min(90dvh,52rem)] max-w-[min(42rem,calc(100vw-2rem))]"
        )}
      >
        {children}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500 dark:text-white/55">{label}</dt>
      <dd className={cn("text-right font-medium text-gray-900 dark:text-white", mono && "font-mono text-xs")}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Create a blocker — either scoped to a release (detail page) or with a release picker (list page).
 * Shows a confirmation summary after successful create.
 */
export function BlockerFormModal({
  open,
  onClose,
  onCreated,
  releaseCode: lockedReleaseCode,
  releaseName: lockedReleaseName = "",
  departmentName: lockedDepartmentName = "",
  applicationName: lockedApplicationName = "",
  raisedByDefault = "",
  defaultStatus = "Open",
}: Props) {
  const scoped = Boolean(lockedReleaseCode);

  const defaults = useMemo(
    () => ({
      releaseId: "",
      releaseCode: lockedReleaseCode ?? "",
      blockerType: "Environment",
      blockerDescription: "",
      severity: "High",
      raisedDate: today(),
      raisedBy: raisedByDefault,
      assignedTo: "",
      targetResolutionDate: "",
      escalationLevel: "L1 - Team Lead",
      rootCause: "",
      impactOnRelease: "",
      applicationName: lockedApplicationName,
    }),
    [lockedReleaseCode, lockedApplicationName, raisedByDefault]
  );

  const [form, setForm] = useState(defaults);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);
  const [errorBody, setErrorBody] = useState<unknown>(null);
  const [created, setCreated] = useState<CreatedSummary | null>(null);

  /** Keep the API body so FIELD_LOCK_DENIED titles as “This field is locked”. */
  const setError = (message: string | null, body: unknown = null) => {
    setErrorState(message);
    setErrorBody(message ? body : null);
  };

  useEffect(() => {
    if (!open) {
      setCreated(null);
      return;
    }
    setForm(defaults);
    setError(null);
    setCreated(null);

    if (scoped) return;

    setLoadingReleases(true);
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<
        {
          id: string;
          releaseCode: string;
          name: string;
          department?: { name?: string } | null;
          applications?: { application?: { name?: string } | null }[];
        }[]
      >("/api/releases", { signal: ac.signal, label: "blocker-form-releases" });
      if (ac.signal.aborted) return;
      setLoadingReleases(false);
      if (!result.ok) {
        setError("Could not load releases");
        return;
      }
      setReleases(
        (result.data ?? [])
          .map((r) => ({
            id: r.id,
            releaseCode: r.releaseCode,
            name: r.name,
            departmentName: r.department?.name ?? "",
            applicationName: r.applications?.[0]?.application?.name ?? "",
          }))
          .sort((a, b) => a.releaseCode.localeCompare(b.releaseCode))
      );
    })();
    return () => ac.abort();
  }, [open, defaults, scoped]);

  if (!open) return null;

  const set =
    (key: keyof typeof defaults) =>
    (value: string) =>
      setForm((prev) => ({ ...prev, [key]: value }));

  const selectedRelease = releases.find((r) => r.id === form.releaseId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const releaseCode = scoped ? lockedReleaseCode! : selectedRelease?.releaseCode ?? "";
    if (!releaseCode) {
      setError("Select a release");
      return;
    }
    if (!form.blockerDescription.trim() || !form.impactOnRelease.trim()) {
      setError("Description and impact on release are required");
      return;
    }

    setSaving(true);
    setError(null);
    const result = await safeFetchJson<CreatedSummary & { error?: string }>("/api/blockers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releaseCode,
        departmentName: scoped ? lockedDepartmentName : selectedRelease?.departmentName,
        applicationName:
          form.applicationName.trim() ||
          (scoped ? lockedApplicationName : selectedRelease?.applicationName) ||
          undefined,
        blockerType: form.blockerType,
        blockerDescription: form.blockerDescription.trim(),
        severity: form.severity,
        raisedDate: form.raisedDate,
        raisedBy: form.raisedBy,
        assignedTo: form.assignedTo || null,
        targetResolutionDate: form.targetResolutionDate || null,
        escalationLevel: form.escalationLevel,
        rootCause: form.rootCause || null,
        impactOnRelease: form.impactOnRelease.trim(),
        status: defaultStatus || "Open",
        daysOpen: 0,
      }),
      label: "create-blocker",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      const msg =
        result.ok && result.data && typeof result.data === "object" && "error" in result.data
          ? String((result.data as { error?: string }).error)
          : "Failed to create blocker";
      setError(msg, result.data);
      return;
    }

    const data = result.data;
    onCreated();
    setCreated({
      id: data.id,
      blockerCode: data.blockerCode,
      releaseCode: data.releaseCode || releaseCode,
      releaseName: data.releaseName || lockedReleaseName || selectedRelease?.name || "—",
      blockerType: data.blockerType || form.blockerType,
      severity: data.severity || form.severity,
      status: data.status || defaultStatus || "Open",
      impactOnRelease: data.impactOnRelease || form.impactOnRelease,
    });
  };

  const dialog = created ? (
    <BlockerModalFrame labelledBy="blocker-created-title" onClose={onClose} compact>
      <div className="min-w-0 p-6">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="blocker-created-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              Blocker created
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-white/60">
              Your blocker was saved successfully.
            </p>
          </div>
        </div>

        <dl className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm dark:border-[var(--border)] dark:bg-white/5">
          <SummaryRow label="Blocker ID" value={created.blockerCode} mono />
          <SummaryRow label="Release" value={created.releaseCode} mono />
          <SummaryRow label="Type" value={created.blockerType} />
          <SummaryRow label="Severity" value={created.severity} />
          <SummaryRow label="Status" value={created.status} />
          <SummaryRow label="Impact" value={created.impactOnRelease} />
        </dl>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className={taBtnSecondary}
            onClick={() => {
              setCreated(null);
              setForm(defaults);
              setError(null);
            }}
          >
            Create another
          </button>
          <ProgressLink
            href={`/blockers/${created.id}`}
            className={cn(taBtnSecondary, "inline-flex items-center")}
          >
            View blocker
          </ProgressLink>
          <button type="button" className={taBtnPrimary} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </BlockerModalFrame>
  ) : (
    <BlockerModalFrame labelledBy="new-blocker-title" onClose={onClose}>
        <div className="shrink-0 border-b border-gray-200 px-5 py-4 dark:border-[var(--border)]">
          <h2 id="new-blocker-title" className="text-lg font-semibold text-gray-900 dark:text-white">New Blocker</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-white/55">
            {scoped
              ? `${lockedReleaseCode} — ${lockedReleaseName}`
              : "Link a blocker to a release. Blocker ID is assigned automatically."}
          </p>
        </div>

        <form id="blocker-create-form" onSubmit={submit} className="min-h-0 min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto px-5 py-4">
          {!scoped && (
            <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
              Release <span className="text-rose-500">*</span>
              <div className="mt-1">
                <SearchableSelect
                  options={releases.map((r) => ({
                    value: r.id,
                    label: `${r.releaseCode} — ${r.name}`,
                  }))}
                  value={form.releaseId}
                  onChange={(id) => {
                    const rel = releases.find((r) => r.id === id);
                    setForm((prev) => ({
                      ...prev,
                      releaseId: id,
                      releaseCode: rel?.releaseCode ?? "",
                      applicationName: rel?.applicationName || prev.applicationName,
                    }));
                  }}
                  placeholder={loadingReleases ? "Loading…" : "Select release…"}
                  disabled={loadingReleases}
                />
              </div>
            </label>
          )}

          <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
            Blocker type <span className="text-rose-500">*</span>
            <select
              className={fieldClass}
              value={form.blockerType}
              onChange={(e) => set("blockerType")(e.target.value)}
              required
            >
              {BLOCKER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
            Description <span className="text-rose-500">*</span>
            <textarea
              className={cn(fieldClass, "min-h-[72px]")}
              value={form.blockerDescription}
              onChange={(e) => set("blockerDescription")(e.target.value)}
              required
            />
          </label>

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Severity <span className="text-rose-500">*</span>
              <select
                className={fieldClass}
                value={form.severity}
                onChange={(e) => set("severity")(e.target.value)}
                required
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Escalation
              <select
                className={fieldClass}
                value={form.escalationLevel}
                onChange={(e) => set("escalationLevel")(e.target.value)}
              >
                {ESCALATIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
            Impact on release <span className="text-rose-500">*</span>
            <input
              className={fieldClass}
              value={form.impactOnRelease}
              onChange={(e) => set("impactOnRelease")(e.target.value)}
              required
            />
          </label>

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Raised date <span className="text-rose-500">*</span>
              <input
                type="date"
                className={fieldClass}
                value={form.raisedDate}
                onChange={(e) => set("raisedDate")(e.target.value)}
                required
              />
            </label>
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Target resolution
              <input
                type="date"
                className={fieldClass}
                value={form.targetResolutionDate}
                onChange={(e) => set("targetResolutionDate")(e.target.value)}
              />
            </label>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Raised by
              <input
                className={fieldClass}
                value={form.raisedBy}
                onChange={(e) => set("raisedBy")(e.target.value)}
              />
            </label>
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Assigned to
              <input
                className={fieldClass}
                value={form.assignedTo}
                onChange={(e) => set("assignedTo")(e.target.value)}
              />
            </label>
          </div>

          <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
            Application
            <input
              className={fieldClass}
              value={form.applicationName}
              onChange={(e) => set("applicationName")(e.target.value)}
            />
          </label>

          <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
            Root cause (optional)
            <input
              className={fieldClass}
              value={form.rootCause}
              onChange={(e) => set("rootCause")(e.target.value)}
            />
          </label>
        </form>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-[var(--border)]">
          <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            form="blocker-create-form"
            className={taBtnPrimary}
            disabled={saving || (!scoped && (loadingReleases || !form.releaseId))}
          >
            {saving ? "Saving…" : "Create blocker"}
          </button>
        </div>
    </BlockerModalFrame>
  );

  return (
    <>
      {createPortal(dialog, document.body)}
      <FormAlertDialog
        alert={
          error
            ? buildFormSaveAlert(errorBody, error, { entityLabel: "blocker" })
            : null
        }
        onDismiss={() => setError(null)}
      />
    </>
  );
}
