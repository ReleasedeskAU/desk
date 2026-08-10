"use client";

/**
 * Config-driven status picker: only legal next statuses, with soft/hard gate
 * feedback inline. Flexible unmet gates require a typed override reason.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Lock, RefreshCw } from "lucide-react";
import { StatusChip, type ChipTone } from "@/components/detail/editable";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import { buildFormSaveAlert } from "@/lib/form-save-alert";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { loadJsonEffect, safeFetchJson } from "@/lib/safe-fetch";
import type { LegalNextStatusView } from "@/lib/release-lifecycle-transition";
import type { ReleaseLifecycleStatusKind } from "@/lib/release-lifecycle-config";
import { toneForLifecycleKind } from "@/lib/release-lifecycle-status-ui";

type LifecyclePayload = {
  status: string;
  currentLabel: string;
  currentKind?: ReleaseLifecycleStatusKind | null;
  currentEnabled?: boolean;
  unknownStatus: boolean;
  configPin: "pinned" | "latest-unpinned";
  next: LegalNextStatusView[];
};

export type ReleaseStatusPickerProps = {
  releaseId: string;
  status: string;
  canEdit: boolean;
  refreshKey?: number;
  onStatusChanged: () => void;
};

/**
 * Load legal next statuses and patch with optional overrideReason.
 */
export function ReleaseStatusPicker({
  releaseId,
  status,
  canEdit,
  refreshKey = 0,
  onStatusChanged,
}: ReleaseStatusPickerProps) {
  const [data, setData] = useState<LifecyclePayload | null>(null);
  const [selected, setSelected] = useState<LegalNextStatusView | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return loadJsonEffect<LifecyclePayload>(
      `/api/releases/${releaseId}/lifecycle`,
      setData,
      { label: "release-lifecycle-picker" }
    );
  }, [refreshKey, releaseId]);

  const next = data?.next ?? [];
  const needsOverride = selected?.outcome === "needs_override";
  const blocked = selected?.outcome === "blocked";

  const confirmDisabled = useMemo(() => {
    if (!selected || busy || blocked) return true;
    if (needsOverride && overrideReason.trim().length < 3) return true;
    return false;
  }, [blocked, busy, needsOverride, overrideReason, selected]);

  const apply = async () => {
    if (!selected || confirmDisabled) return;
    setBusy(true);
    setError(null);
    const body: Record<string, string> = { status: selected.key };
    if (needsOverride) body.overrideReason = overrideReason.trim();
    const result = await safeFetchJson(`/api/releases/${releaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      label: "release-patch-status",
      rejectHttpErrors: false,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Status change failed");
      return;
    }
    // rejectHttpErrors: false — HTTP errors still return ok:true with an error body.
    if ((result.status ?? 0) >= 300) {
      const payload =
        result.data && typeof result.data === "object"
          ? (result.data as { error?: string })
          : null;
      setError(payload?.error ?? `Status change failed (${result.status})`);
      return;
    }
    setSelected(null);
    setOverrideReason("");
    onStatusChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip
          tone={toneForLifecycleKind(data?.currentKind ?? null) as ChipTone}
          label={data?.currentLabel ?? status}
        />
        {data?.currentEnabled === false && !data?.unknownStatus ? (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
            Off in lifecycle settings
          </span>
        ) : null}
        {data?.configPin === "latest-unpinned" && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
            Following latest config (unpinned)
          </span>
        )}
        {data?.unknownStatus && (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
            Status not in lifecycle config
          </span>
        )}
      </div>

      {!canEdit ? (
        <p className="text-sm text-slate-500 dark:text-white/50">
          You need editor access to change status.
        </p>
      ) : data?.unknownStatus ? (
        <p className="text-sm text-rose-600 dark:text-rose-300">
          This release&apos;s status is not in the configured lifecycle graph, so no legal
          next steps can be offered. Fix the stored status or update the lifecycle config.
        </p>
      ) : next.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-white/50">
          No legal next statuses from here
          {data == null ? " (loading…)" : ""}.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {next.map((item) => {
            const active = selected?.key === item.key && selected.isPreviousStatus === item.isPreviousStatus;
            return (
              <button
                key={`${item.key}:${item.isPreviousStatus ? "prev" : "direct"}`}
                type="button"
                disabled={busy}
                onClick={() => {
                  setSelected(item);
                  setError(null);
                }}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                  active
                    ? "border-violet-500 bg-violet-50 text-violet-800 dark:bg-violet-500/20 dark:text-violet-100"
                    : "border-slate-200 bg-white text-slate-700 hover:border-violet-300 dark:border-[var(--border)] dark:bg-[var(--card)] dark:text-white/80",
                  item.outcome === "blocked" && "opacity-70"
                )}
              >
                {item.isPreviousStatus ? `Return to ${item.label}` : item.label}
                {item.outcome === "needs_override" ? " · override" : ""}
                {item.outcome === "blocked" ? " · blocked" : ""}
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-[var(--border)] dark:bg-white/5">
          <div className="mb-2 flex items-center gap-2">
            <RefreshCw size={16} className="text-violet-600" aria-hidden />
            <p className="text-sm font-semibold text-slate-800 dark:text-white">
              Change to {selected.isPreviousStatus ? `previous (${selected.label})` : selected.label}?
            </p>
          </div>

          {selected.gates.length > 0 && (
            <ul className="mb-3 space-y-1.5">
              {selected.gates.map((gate) => (
                <li
                  key={gate.gateType}
                  className={cn(
                    "flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs",
                    gate.passed
                      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"
                      : gate.hard
                        ? "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"
                        : "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100"
                  )}
                >
                  {gate.hard ? (
                    <Lock size={12} className="mt-0.5 shrink-0" aria-hidden />
                  ) : gate.soft ? (
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
                  ) : (
                    <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  )}
                  <span>
                    <span className="font-semibold">{gate.label}</span>
                    {" — "}
                    {gate.passed ? "met" : gate.reason}
                    {gate.soft ? " (soft — override allowed)" : ""}
                    {gate.hard ? " (hard block)" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {needsOverride && (
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-white/60">
                Override reason (required)
              </span>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-[var(--border)] dark:bg-[var(--card)] dark:text-white"
                placeholder="Why is this transition allowed despite unmet gates?"
              />
            </label>
          )}

          {blocked && (
            <p className="mb-3 text-sm text-rose-600 dark:text-rose-300">
              Required gate(s) block this move — override is not permitted.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={taBtnSecondary}
              disabled={busy}
              onClick={() => {
                setSelected(null);
                setOverrideReason("");
                setError(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className={taBtnPrimary}
              disabled={confirmDisabled}
              onClick={() => void apply()}
            >
              {busy ? "Updating…" : `Confirm ${selected.label}`}
            </button>
          </div>
        </div>
      )}

      <FormAlertDialog
        alert={
          error
            ? buildFormSaveAlert(null, error, { entityLabel: "release" })
            : null
        }
        onDismiss={() => setError(null)}
      />
    </div>
  );
}
