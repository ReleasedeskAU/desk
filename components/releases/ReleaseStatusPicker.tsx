"use client";

/**
 * Config-driven status picker: only legal next statuses, with soft/hard check
 * feedback inline. Flexible unmet checks require a typed exception reason.
 */
import { useEffect, useMemo, useState } from "react";
import { StatusChip, type ChipTone } from "@/components/detail/editable";
import { LifecycleExceptionConfirm } from "@/components/detail/LifecycleExceptionConfirm";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import { buildFormSaveAlert } from "@/lib/form-save-alert";
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
            Using your latest workflow settings
          </span>
        )}
        {data?.unknownStatus && (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
            Status not in workflow settings
          </span>
        )}
      </div>

      {!canEdit ? (
        <p className="text-sm text-slate-500 dark:text-white/50">
          You need editor access to change status.
        </p>
      ) : data?.unknownStatus ? (
        <p className="text-sm text-rose-600 dark:text-rose-300">
          This status isn&apos;t in your workflow settings, so no next steps can be
          offered. Pick a status that exists under Lifecycle, or ask an admin to
          update the workflow.
        </p>
      ) : next.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-white/50">
          No legal next statuses from here
          {data == null ? " (loading…)" : ""}.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {next.map((item) => {
            const active =
              selected?.key === item.key &&
              selected.isPreviousStatus === item.isPreviousStatus;
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
                {item.outcome === "needs_override" ? " · reason needed" : ""}
                {item.outcome === "blocked" ? " · blocked" : ""}
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <LifecycleExceptionConfirm
          targetLabel={selected.label}
          isReturn={selected.isPreviousStatus}
          needsException={needsOverride}
          blocked={blocked}
          exceptionReason={overrideReason}
          onExceptionReasonChange={setOverrideReason}
          busy={busy}
          confirmDisabled={confirmDisabled}
          onCancel={() => {
            setSelected(null);
            setOverrideReason("");
            setError(null);
          }}
          onConfirm={() => void apply()}
          checks={selected.gates.map((gate) => ({
            label: gate.label,
            passed: gate.passed,
            reason: gate.reason,
            hard: gate.hard,
            soft: gate.soft,
          }))}
        />
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
