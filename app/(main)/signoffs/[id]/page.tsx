"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Stamp } from "lucide-react";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import { DetailSection } from "@/components/detail/editable";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import { buildFormSaveAlert } from "@/lib/form-save-alert";
import { canEdit as sessionCanEdit, type SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { taBtnPrimary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { SignoffListRow } from "@/lib/signoff-list";
import type { SignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config";
import { signoffNextStatusLabels } from "@/lib/signoff-lifecycle-transition";

type Props = { params: Promise<{ id: string }> };

/**
 * Sign-off checklist item for one release type. Saving PATCHes the Release row.
 */
export default function SignoffDetailPage({ params }: Props) {
  const { id } = use(params);
  const [row, setRow] = useState<SignoffListRow | null>(null);
  const [config, setConfig] = useState<SignoffLifecycleConfig | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [nextStatus, setNextStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [rowRes, cfgRes, meRes] = await Promise.all([
      safeFetchJson<SignoffListRow>(`/api/signoffs/${encodeURIComponent(id)}`, { label: "signoff-detail" }),
      safeFetchJson<{ config: SignoffLifecycleConfig }>("/api/signoff-lifecycle-config", {
        label: "signoff-lifecycle",
      }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { label: "auth-me" }),
    ]);
    setRow(rowRes.ok ? rowRes.data : null);
    setConfig(cfgRes.ok ? cfgRes.data.config : null);
    setUser(meRes.ok ? meRes.data.user : null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const nextOptions = config ? signoffNextStatusLabels(config, row?.status) : [];
  useEffect(() => {
    setNextStatus(nextOptions[0] ?? "");
  }, [row?.id, row?.status, nextOptions[0]]);

  const editsLocked = /^cancell?ed$/i.test(row?.releaseStatus ?? "");
  const canEdit = sessionCanEdit(user) && !editsLocked;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!row || !nextStatus) {
      setError("Pick the next decision.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await safeFetchJson<{ error?: string }>(`/api/releases/${encodeURIComponent(row.releaseId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [row.releaseField]: nextStatus }),
      label: "record-signoff",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      setError(result.ok && result.data?.error ? result.data.error : "Failed to record sign-off");
      return;
    }
    await load();
  };

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading sign-off…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Sign-off not found.</p>;

  return (
    <DetailPageShell
      entityCode={row.signoffCode}
      title={`${row.signoffCode} — ${row.typeLabel}`}
      subtitle={`${row.releaseCode} · ${row.mandatory ? "Required" : "Optional"}`}
      backHref="/signoffs"
      backLabel="Sign-offs"
      pageKey="signoffs"
    >
      <DetailSection
        icon={Stamp}
        tone="emerald"
        title="Checklist item"
        description="Stored on the parent release — recording here uses the same PATCH as Edit Release."
        defaultOpen
      >
        <DetailFieldGrid cols={2}>
          <DetailField label="Sign-off ID" value={row.signoffCode} hint="Derived from the release ID and type. Not a separate table." />
          <DetailField label="Type" value={row.typeLabel} />
          <DetailField label="Status" value={<StatusBadge status={row.status} />} />
          <DetailField label="Required" value={row.mandatory ? "Required" : "Optional"} />
          <DetailField
            label="Release"
            value={
              <ProgressLink href={`/releases/${row.releaseId}#section-signoffs`} className="text-brand-600 hover:underline dark:text-brand-400">
                {row.releaseCode} — {row.releaseName}
              </ProgressLink>
            }
          />
          <DetailField label="Release status" value={row.releaseStatus} />
          <DetailField label="Application" value={row.application} />
          <DetailField label="Department" value={row.department} />
          <DetailField label="Owner" value={row.owner} />
        </DetailFieldGrid>

        {editsLocked ? (
          <p className="mt-5 border-t border-gray-100 pt-4 text-sm text-rose-700 dark:border-[var(--border)] dark:text-rose-300">
            This release is {row.releaseStatus}. It is locked — nothing can be edited.
          </p>
        ) : null}

        {canEdit ? (
          <form onSubmit={submit} className="mt-5 max-w-sm space-y-3 border-t border-gray-100 pt-4 dark:border-[var(--border)]">
            <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
              Record decision
              <select
                className={cn(taInput, "mt-1")}
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
            <button type="submit" className={taBtnPrimary} disabled={saving || !nextStatus}>
              {saving ? "Saving…" : "Save decision"}
            </button>
          </form>
        ) : null}
      </DetailSection>
      <FormAlertDialog
        alert={error ? buildFormSaveAlert(null, error, { entityLabel: "sign-off" }) : null}
        onDismiss={() => setError(null)}
      />
    </DetailPageShell>
  );
}
