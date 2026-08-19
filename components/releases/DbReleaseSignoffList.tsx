"use client";

import { useMemo, useState } from "react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ReleaseRelatedListFrame } from "@/components/releases/ReleaseRelatedListFrame";
import {
  CreateModalShell,
  RequiredMark,
} from "@/components/create-flow/CreateFlowUi";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import { buildFormSaveAlert } from "@/lib/form-save-alert";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { safeFetchJson } from "@/lib/safe-fetch";
import type { SignoffLifecycleConfig, SignoffReleaseField } from "@/lib/signoff-lifecycle-config";
import { DEFAULT_SIGNOFF_TYPES } from "@/lib/signoff-lifecycle-config";
import { signoffNextStatusLabels } from "@/lib/signoff-lifecycle-transition";
import { encodeSignoffRowId, signoffCodeFor } from "@/lib/signoff-list";

type Props = {
  releaseId: string;
  releaseCode: string;
  values: Partial<Record<SignoffReleaseField, string | null | undefined>>;
  signoffConfig: SignoffLifecycleConfig | null;
  canEdit?: boolean;
  onChanged: () => void;
};

/**
 * Sign-off checklist for this release (same fields as Edit Release / PATCH).
 * Types come from Sign-off Lifecycle; decisions stay on the Release row.
 */
export function DbReleaseSignoffList({
  releaseId,
  releaseCode,
  values,
  signoffConfig,
  canEdit = false,
  onChanged,
}: Props) {
  const types = useMemo(() => {
    const list = signoffConfig?.types?.length ? signoffConfig.types : [...DEFAULT_SIGNOFF_TYPES];
    return list.filter((type) => type.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [signoffConfig]);

  const [modalOpen, setModalOpen] = useState(false);
  const [fieldKey, setFieldKey] = useState<SignoffReleaseField | "">("");
  const [nextStatus, setNextStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedType = types.find((type) => type.releaseField === fieldKey);
  const currentValue = fieldKey ? values[fieldKey]?.trim() || "Pending" : "";
  const nextOptions =
    signoffConfig && fieldKey ? signoffNextStatusLabels(signoffConfig, values[fieldKey]) : [];

  const openFor = (field: SignoffReleaseField | "") => {
    setFieldKey(field);
    const options =
      signoffConfig && field ? signoffNextStatusLabels(signoffConfig, values[field]) : [];
    setNextStatus(options[0] ?? "");
    setError(null);
    setModalOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fieldKey || !nextStatus) {
      setError("Pick a sign-off type and the next decision.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await safeFetchJson<{ error?: string }>(`/api/releases/${encodeURIComponent(releaseId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [fieldKey]: nextStatus }),
      label: "record-signoff",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      setError(result.ok && result.data?.error ? result.data.error : "Failed to record sign-off");
      return;
    }
    onChanged();
    setModalOpen(false);
  };

  return (
    <>
      <ReleaseRelatedListFrame
        heading="Sign-off checklist"
        addLabel="Record sign-off"
        canEdit={canEdit}
        onAdd={() => openFor("")}
        loading={false}
        loadingLabel=""
        emptyLabel="No sign-off types are enabled."
        hasItems={types.length > 0}
      >
        <ul className="space-y-2">
          {types.map((type) => {
            const value = type.releaseField ? values[type.releaseField] : null;
            const display = value?.trim() || "Pending";
            const href = type.releaseField
              ? `/signoffs/${encodeURIComponent(encodeSignoffRowId(releaseId, type.releaseField))}`
              : null;
            return (
              <li key={type.key} className="space-y-1.5 rounded-lg bg-gray-50/80 px-3 py-2.5 dark:bg-white/5">
                <div className="flex flex-wrap items-center gap-2">
                  {href ? (
                    <ProgressLink
                      href={href}
                      className="font-mono text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {signoffCodeFor(releaseCode, type.key)}
                    </ProgressLink>
                  ) : (
                    <span className="text-sm font-semibold text-gray-800 dark:text-white">{type.label}</span>
                  )}
                  <span className="text-sm text-gray-700 dark:text-white/80">{type.label}</span>
                  <StatusBadge status={display} />
                  {type.mandatory ? (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Required
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Optional
                    </span>
                  )}
                </div>
                {!type.releaseField ? (
                  <p className="text-xs text-gray-500 dark:text-white/50">No release field yet.</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </ReleaseRelatedListFrame>

      {modalOpen ? (
        <CreateModalShell
          title="Record sign-off"
          description="Updates the checklist field on this release (same PATCH as Edit Release)."
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button type="button" className={taBtnSecondary} onClick={() => setModalOpen(false)} disabled={saving}>
                Cancel
              </button>
              <button
                type="submit"
                form="signoff-record-form"
                className={taBtnPrimary}
                disabled={saving || !fieldKey || !nextStatus}
              >
                {saving ? "Saving…" : "Save decision"}
              </button>
            </>
          }
        >
          <form id="signoff-record-form" onSubmit={submit} className="min-w-0 space-y-4">
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Type
              <RequiredMark />
              <select
                className={cn(taInput, "mt-1 min-w-0 max-w-full")}
                value={fieldKey}
                onChange={(event) => {
                  const next = event.target.value as SignoffReleaseField | "";
                  setFieldKey(next);
                  const options =
                    signoffConfig && next ? signoffNextStatusLabels(signoffConfig, values[next]) : [];
                  setNextStatus(options[0] ?? "");
                }}
              >
                <option value="">Select type…</option>
                {types
                  .filter((type) => type.releaseField)
                  .map((type) => (
                    <option key={type.key} value={type.releaseField!}>
                      {type.label}
                    </option>
                  ))}
              </select>
            </label>
            {selectedType ? (
              <p className="text-xs text-gray-500 dark:text-white/55">Current: {currentValue}</p>
            ) : null}
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Decision
              <RequiredMark />
              <select
                className={cn(taInput, "mt-1 min-w-0 max-w-full")}
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value)}
                disabled={nextOptions.length === 0}
              >
                {nextOptions.length === 0 ? (
                  <option value="">No further steps</option>
                ) : (
                  nextOptions.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))
                )}
              </select>
            </label>
          </form>
        </CreateModalShell>
      ) : null}
      <FormAlertDialog
        alert={error ? buildFormSaveAlert(null, error, { entityLabel: "sign-off" }) : null}
        onDismiss={() => setError(null)}
      />
    </>
  );
}
