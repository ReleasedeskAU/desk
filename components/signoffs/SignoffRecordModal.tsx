"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { SignoffListRow } from "@/lib/signoff-list";
import {
  signoffDecisionControlEnabled,
  signoffManualNextLabels,
} from "@/lib/signoff-record-actions";
import { controlLoc, fieldLoc, locatorToken } from "@/lib/ui-control-locators";

export type SignoffRecordLockedRelease = {
  id: string;
  values: Partial<Record<SignoffReleaseField, string | null | undefined>>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  config: SignoffLifecycleConfig | null;
  /** Release page: type/decision apply to this release only. */
  lockedRelease?: SignoffRecordLockedRelease | null;
  /** Sign-offs list: user picks a release; current values come from these rows. */
  rows?: SignoffListRow[];
  initialField?: SignoffReleaseField | "";
};

type ReleaseOption = {
  id: string;
  releaseCode: string;
  name: string;
  values: Partial<Record<SignoffReleaseField, string | null | undefined>>;
};

/**
 * Shared Record sign-off modal (Release checklist + Sign-offs list create).
 * Decision is the second field on the Release-page form and must stay usable
 * for new/pending requests — do not disable it just because Type is still empty.
 */
export function SignoffRecordModal({
  open,
  onClose,
  onSaved,
  config,
  lockedRelease = null,
  rows = [],
  initialField = "",
}: Props) {
  const loc = (control: string) => locatorToken("signoff_record", control);
  const [releaseId, setReleaseId] = useState("");
  const [fieldKey, setFieldKey] = useState<SignoffReleaseField | "">("");
  const [nextStatus, setNextStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const types = useMemo(() => {
    const list = config?.types?.length ? config.types : [];
    return list
      .filter((type) => type.enabled && type.releaseField)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [config]);

  const releases = useMemo((): ReleaseOption[] => {
    if (lockedRelease) {
      return [{ id: lockedRelease.id, releaseCode: "", name: "", values: lockedRelease.values }];
    }
    const map = new Map<string, ReleaseOption>();
    for (const row of rows) {
      let rel = map.get(row.releaseId);
      if (!rel) {
        rel = {
          id: row.releaseId,
          releaseCode: row.releaseCode,
          name: row.releaseName,
          values: {},
        };
        map.set(row.releaseId, rel);
      }
      rel.values[row.releaseField] = row.status;
    }
    return [...map.values()];
  }, [lockedRelease, rows]);

  const effectiveReleaseId = lockedRelease?.id || releaseId;
  const selectedRelease = releases.find((item) => item.id === effectiveReleaseId);
  const currentStatus = fieldKey ? selectedRelease?.values[fieldKey] ?? null : null;
  const nextOptions = config ? signoffManualNextLabels(config, currentStatus) : [];
  const decisionEnabled = signoffDecisionControlEnabled(config, currentStatus);
  const selectedType = types.find((type) => type.releaseField === fieldKey);
  const currentDisplay = fieldKey
    ? (selectedRelease?.values[fieldKey]?.trim() || "Pending")
    : "";

  useEffect(() => {
    if (!open) return;
    setReleaseId(lockedRelease?.id ?? "");
    setFieldKey(initialField);
    setError(null);
  }, [open, lockedRelease?.id, initialField]);

  useEffect(() => {
    setNextStatus(decisionEnabled ? (nextOptions[0] ?? "") : "");
  }, [effectiveReleaseId, fieldKey, decisionEnabled, nextOptions[0]]);

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!effectiveReleaseId || !fieldKey || !nextStatus) {
      setError("Pick a release, sign-off type, and the next decision.");
      return;
    }
    if (!decisionEnabled) {
      setError("This sign-off is already recorded and can’t be changed.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await safeFetchJson<{ error?: string }>(
      `/api/releases/${encodeURIComponent(effectiveReleaseId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldKey]: nextStatus }),
        label: "record-signoff",
        rejectHttpErrors: false,
      }
    );
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      setError(result.ok && result.data?.error ? result.data.error : "Failed to record sign-off");
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <>
      <CreateModalShell
        title="Record sign-off"
        description="Updates the checklist field on the release (same PATCH as Edit Release)."
        onClose={onClose}
        footer={
          <>
            <button
              type="button"
              className={taBtnSecondary}
              onClick={onClose}
              disabled={saving}
              {...controlLoc(loc("cancel"))}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="signoff-record-form"
              className={taBtnPrimary}
              disabled={saving || !effectiveReleaseId || !fieldKey || !nextStatus || !decisionEnabled}
              {...controlLoc(loc("save"))}
            >
              {saving ? "Saving…" : "Save decision"}
            </button>
          </>
        }
      >
        <form id="signoff-record-form" onSubmit={submit} className="min-w-0 space-y-4">
          {!lockedRelease ? (
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Release
              <RequiredMark />
              <select
                className={cn(taInput, "mt-1 min-w-0 max-w-full")}
                value={releaseId}
                onChange={(event) => {
                  setReleaseId(event.target.value);
                  setFieldKey("");
                }}
                {...fieldLoc(loc("release"))}
              >
                <option value="">Select release…</option>
                {releases.map((release) => (
                  <option key={release.id} value={release.id}>
                    {release.releaseCode} — {release.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
            Type
            <RequiredMark />
            <select
              className={cn(taInput, "mt-1 min-w-0 max-w-full")}
              value={fieldKey}
              disabled={Boolean(initialField)}
              onChange={(event) => setFieldKey(event.target.value as SignoffReleaseField | "")}
              {...fieldLoc(loc("type"))}
            >
              <option value="">Select type…</option>
              {types.map((type) => (
                <option key={type.key} value={type.releaseField!}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          {selectedType ? (
            <p className="text-xs text-gray-500 dark:text-white/55">Current: {currentDisplay}</p>
          ) : null}
          <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
            Decision
            <RequiredMark />
            <select
              aria-label="Decision"
              className={cn(taInput, "mt-1 min-w-0 max-w-full")}
              value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value)}
              disabled={!decisionEnabled}
              {...fieldLoc(loc("decision"))}
            >
              {decisionEnabled ? (
                nextOptions.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))
              ) : (
                <option value="">No further steps</option>
              )}
            </select>
          </label>
        </form>
      </CreateModalShell>
      <FormAlertDialog
        alert={error ? buildFormSaveAlert(null, error, { entityLabel: "sign-off" }) : null}
        onDismiss={() => setError(null)}
      />
    </>
  );
}
