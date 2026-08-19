"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchableSelect } from "@/components/ui/searchable-multi-select";
import {
  CreateConfirmation,
  CreateModalShell,
  FieldError,
  RequiredMark,
  SummaryRow,
} from "@/components/create-flow/CreateFlowUi";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import { buildFormSaveAlert } from "@/lib/form-save-alert";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { safeFetchJson } from "@/lib/safe-fetch";
import { APPROVAL_DECISIONS, approvalTypeSelectOptions } from "@/lib/validation/approval";

type ReleaseOption = { id: string; releaseCode: string; name: string };
type UserOption = { id: string; userId: string; name: string };
type CreatedApproval = {
  id: string;
  approvalCode: string;
  approvalType: string;
  decision: string;
  submittedDate: string;
  release: { releaseCode: string; name: string };
  approver: { userId: string; name: string };
};

const CONDITIONS_DECISION = "Approved with Conditions";

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (defaultDecision = "Pending") => ({
  releaseId: "",
  approvalType: "CAB Final",
  approverId: "",
  submittedDate: today(),
  decision: defaultDecision,
  decisionDate: "",
  comments: "",
  conditions: "",
  cabMeetingId: "",
});

/** Creates an approval with release and approver lookups, then displays its generated identity. */
export function ApprovalCreateModal({
  open,
  onClose,
  onCreated,
  approvalTypes: _approvalTypes = [],
  decisionOptions: decisionOptionsProp = [],
  defaultDecision = "Pending",
  lockReleaseId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  approvalTypes?: string[];
  /** Enabled decision labels from approval lifecycle config. */
  decisionOptions?: string[];
  /** Enabled default decision from approval lifecycle config. */
  defaultDecision?: string;
  /** When set, the approval is created for this release. */
  lockReleaseId?: string;
}) {
  const decisionOptions = useMemo(
    () => (decisionOptionsProp.length > 0 ? decisionOptionsProp : [...APPROVAL_DECISIONS]),
    [decisionOptionsProp]
  );
  const [form, setForm] = useState(() => emptyForm(defaultDecision));
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<CreatedApproval | null>(null);

  const scoped = Boolean(lockReleaseId);
  const conditionsRequired =
    form.decision.toLocaleLowerCase() === CONDITIONS_DECISION.toLocaleLowerCase();
  const decisionDateRequired =
    form.decision.toLocaleLowerCase() !== (defaultDecision || "Pending").toLocaleLowerCase();

  useEffect(() => {
    if (!open) return;
    setForm({ ...emptyForm(defaultDecision || "Pending"), releaseId: lockReleaseId || "" });
    setErrors({});
    setError(null);
    setCreated(null);
    setLoading(true);
    const ac = new AbortController();
    void (async () => {
      const [releaseResult, userResult] = await Promise.all([
        safeFetchJson<ReleaseOption[]>("/api/releases", { signal: ac.signal, label: "approval-create-releases" }),
        safeFetchJson<UserOption[]>("/api/users", { signal: ac.signal, label: "approval-create-users" }),
      ]);
      if (ac.signal.aborted) return;
      setLoading(false);
      if (releaseResult.ok) setReleases(releaseResult.data);
      if (userResult.ok) setUsers(userResult.data);
      if (!releaseResult.ok || !userResult.ok) setError("Could not load required lookup data.");
    })();
    return () => ac.abort();
  }, [open, defaultDecision, lockReleaseId]);

  const typeOptions = useMemo(
    () => approvalTypeSelectOptions(form.approvalType),
    [form.approvalType]
  );
  const selectedRelease = releases.find((release) => release.id === form.releaseId);

  if (!open) return null;

  const set = (key: keyof ReturnType<typeof emptyForm>, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.releaseId) nextErrors.releaseId = "Release is required";
    if (!form.approvalType.trim()) nextErrors.approvalType = "Approval type is required";
    if (!form.approverId) nextErrors.approverId = "Approver is required";
    if (!form.submittedDate) nextErrors.submittedDate = "Submitted date is required";
    if (decisionDateRequired && !form.decisionDate) {
      nextErrors.decisionDate = "Decision date is required";
    }
    if (conditionsRequired && !form.conditions.trim()) {
      nextErrors.conditions = "Write the conditions this approval is subject to.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError("Please fill in the required fields highlighted below.");
      return;
    }

    setSaving(true);
    setError(null);
    const result = await safeFetchJson<CreatedApproval & { error?: string }>("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releaseId: form.releaseId,
        approvalType: form.approvalType.trim(),
        approverId: form.approverId,
        submittedDate: form.submittedDate,
        decision: form.decision,
        decisionDate: form.decisionDate || null,
        comments: form.comments.trim() || null,
        conditions: form.conditions.trim() || null,
        cabMeetingId: form.cabMeetingId.trim() || null,
      }),
      label: "create-approval",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      setError(result.ok && result.data.error ? result.data.error : "Failed to create approval");
      return;
    }
    onCreated();
    setCreated(result.data);
  };

  if (created) {
    return (
      <CreateConfirmation
        entity="Approval"
        viewHref={`/approvals/${created.id}`}
        onClose={onClose}
        onCreateAnother={() => {
          setCreated(null);
          setForm({ ...emptyForm(defaultDecision || "Pending"), releaseId: lockReleaseId || "" });
          setError(null);
        }}
      >
        <SummaryRow label="Approval ID" value={created.approvalCode} mono />
        <SummaryRow label="Release" value={`${created.release.releaseCode} — ${created.release.name}`} />
        <SummaryRow label="Approver" value={`${created.approver.userId} — ${created.approver.name}`} />
        <SummaryRow label="Type" value={created.approvalType} />
        <SummaryRow label="Decision" value={created.decision} />
      </CreateConfirmation>
    );
  }

  return (
    <>
      <CreateModalShell
        title="New Approval"
        description={
          scoped
            ? "This approval is for the open release. ID is assigned automatically."
            : "Approval ID is assigned automatically. Fields marked * are required."
        }
        onClose={onClose}
        footer={
          <>
            <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              form="approval-create-form"
              className={taBtnPrimary}
              disabled={saving || loading}
            >
              {saving ? "Creating…" : "Create approval"}
            </button>
          </>
        }
      >
        <form id="approval-create-form" onSubmit={submit} className="min-w-0 space-y-4">
          {scoped ? (
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600 dark:bg-white/5 dark:text-white/70">
              <p className="font-medium text-slate-800 dark:text-white">
                {selectedRelease
                  ? `${selectedRelease.releaseCode} — ${selectedRelease.name}`
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
                  onChange={(value) => set("releaseId", value)}
                  options={releases.map((release) => ({
                    value: release.id,
                    label: `${release.releaseCode} — ${release.name}`,
                  }))}
                  placeholder={loading ? "Loading…" : "Select release…"}
                  disabled={loading}
                  className={errors.releaseId ? "[&_button]:border-rose-400" : undefined}
                />
              </div>
              <FieldError message={errors.releaseId} />
            </label>
          )}

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Approval type
              <RequiredMark />
              <select
                className={cn(taInput, "mt-1 min-w-0 max-w-full", errors.approvalType && "border-rose-400")}
                value={form.approvalType}
                onChange={(e) => set("approvalType", e.target.value)}
              >
                {typeOptions.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <FieldError message={errors.approvalType} />
            </label>
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Approver
              <RequiredMark />
              <div className="mt-1">
                <SearchableSelect
                  value={form.approverId}
                  onChange={(value) => set("approverId", value)}
                  options={users.map((user) => ({
                    value: user.id,
                    label: `${user.userId} — ${user.name}`,
                  }))}
                  placeholder={loading ? "Loading…" : "Select approver…"}
                  disabled={loading}
                  className={errors.approverId ? "[&_button]:border-rose-400" : undefined}
                />
              </div>
              <FieldError message={errors.approverId} />
            </label>
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Submitted date
              <RequiredMark />
              <input
                type="date"
                className={cn(taInput, "mt-1 min-w-0 max-w-full", errors.submittedDate && "border-rose-400")}
                value={form.submittedDate}
                onChange={(e) => set("submittedDate", e.target.value)}
              />
              <FieldError message={errors.submittedDate} />
            </label>
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Decision
              <RequiredMark />
              <select
                className={cn(taInput, "mt-1 min-w-0 max-w-full")}
                value={form.decision}
                onChange={(e) => set("decision", e.target.value)}
              >
                {decisionOptions.map((decision) => (
                  <option key={decision} value={decision}>
                    {decision}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Decision date
              {decisionDateRequired ? <RequiredMark /> : null}
              <input
                type="date"
                className={cn(taInput, "mt-1 min-w-0 max-w-full", errors.decisionDate && "border-rose-400")}
                value={form.decisionDate}
                onChange={(e) => set("decisionDate", e.target.value)}
              />
              <FieldError message={errors.decisionDate} />
            </label>
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              CAB meeting
              <input
                className={cn(taInput, "mt-1 min-w-0 max-w-full")}
                maxLength={120}
                value={form.cabMeetingId}
                onChange={(e) => set("cabMeetingId", e.target.value)}
              />
            </label>
          </div>

          {conditionsRequired ? (
            <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
              Conditions
              <RequiredMark />
              <textarea
                className={cn(taInput, "mt-1 min-h-[72px] min-w-0 max-w-full", errors.conditions && "border-rose-400")}
                maxLength={4000}
                value={form.conditions}
                onChange={(e) => set("conditions", e.target.value)}
                placeholder="Terms this approval is subject to"
              />
              <FieldError message={errors.conditions} />
            </label>
          ) : null}

          <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
            Comments
            <textarea
              className={cn(taInput, "mt-1 min-h-[72px] min-w-0 max-w-full")}
              maxLength={4000}
              value={form.comments}
              onChange={(e) => set("comments", e.target.value)}
            />
          </label>
        </form>
      </CreateModalShell>
      <FormAlertDialog
        alert={error ? buildFormSaveAlert(null, error, { entityLabel: "approval" }) : null}
        onDismiss={() => setError(null)}
      />
    </>
  );
}
