"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, Stamp, Trash2 } from "lucide-react";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import { DetailSection } from "@/components/detail/editable";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import { SignoffRecordModal } from "@/components/signoffs/SignoffRecordModal";
import { buildFormSaveAlert } from "@/lib/form-save-alert";
import { canEdit as sessionCanEdit, type SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import type { SignoffListRow } from "@/lib/signoff-list";
import type { SignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config";
import {
  signoffDetailActionFlags,
  signoffWithdrawTargetLabel,
} from "@/lib/signoff-record-actions";

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
  const [editing, setEditing] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
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

  const editsLocked = /^cancell?ed$/i.test(row?.releaseStatus ?? "");
  const roleCanEdit = sessionCanEdit(user) && !editsLocked;
  const actions = useMemo(
    () => signoffDetailActionFlags({ roleCanEdit, config, status: row?.status }),
    [roleCanEdit, config, row?.status]
  );
  const withdrawLabel = config && row ? signoffWithdrawTargetLabel(config, row.status) : null;

  const confirmWithdraw = async () => {
    if (!row || !withdrawLabel) return;
    setWithdrawing(true);
    setError(null);
    const result = await safeFetchJson<{ error?: string }>(`/api/releases/${encodeURIComponent(row.releaseId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [row.releaseField]: withdrawLabel }),
      label: "withdraw-signoff",
      rejectHttpErrors: false,
    });
    setWithdrawing(false);
    if (!result.ok || result.status >= 300) {
      setError(result.ok && result.data?.error ? result.data.error : "Failed to withdraw sign-off");
      setWithdrawOpen(false);
      return;
    }
    setWithdrawOpen(false);
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
      actions={
        actions.edit || actions.withdraw ? (
          <div className="flex flex-wrap items-center gap-2">
            {actions.withdraw ? (
              <button
                type="button"
                onClick={() => setWithdrawOpen(true)}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600 dark:text-white/45 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
              >
                <Trash2 size={14} aria-hidden />
                Delete
              </button>
            ) : null}
            {actions.edit ? (
              <button type="button" className={taBtnPrimary} onClick={() => setEditing(true)}>
                <Edit3 size={14} aria-hidden />
                Edit
              </button>
            ) : null}
          </div>
        ) : null
      }
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
      </DetailSection>

      <SignoffRecordModal
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={() => {
          void load();
        }}
        config={config}
        lockedRelease={{ id: row.releaseId, values: { [row.releaseField]: row.status } }}
        initialField={row.releaseField}
      />

      {withdrawOpen && withdrawLabel ? (
        <SignoffWithdrawDialog
          entityCode={row.signoffCode}
          withdrawLabel={withdrawLabel}
          busy={withdrawing}
          onCancel={() => setWithdrawOpen(false)}
          onConfirm={() => void confirmWithdraw()}
        />
      ) : null}

      <FormAlertDialog
        alert={error ? buildFormSaveAlert(null, error, { entityLabel: "sign-off" }) : null}
        onDismiss={() => setError(null)}
      />
    </DetailPageShell>
  );
}

/**
 * Confirm mapping Delete → withdraw. Does not hard-delete a recorded decision.
 */
function SignoffWithdrawDialog({
  entityCode,
  withdrawLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  entityCode: string;
  withdrawLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="signoff-withdraw-title"
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg dark:border-[var(--border)] dark:bg-[var(--card)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="signoff-withdraw-title" className="text-base font-semibold text-gray-900 dark:text-white">
          Withdraw this sign-off?
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-white/65">
          There is no separate sign-off row to delete. Delete records the lifecycle{" "}
          <span className="font-medium text-gray-800 dark:text-white">{withdrawLabel}</span> decision for{" "}
          <span className="font-mono font-medium">{entityCode}</span>. Recorded decisions cannot be changed.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className={taBtnPrimary} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={taBtnSecondary} disabled={busy} onClick={onConfirm}>
            {busy ? "Saving…" : "Withdraw"}
          </button>
        </div>
      </div>
    </div>
  );
}
