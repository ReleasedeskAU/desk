"use client";

import { useEffect, useRef, useState } from "react";
import { StatusChip, type ChipTone } from "@/components/detail/editable";
import { HoverExplain, InfoTooltip } from "@/components/ui/InfoTooltip";
import { ReleaseStatusPicker } from "@/components/releases/ReleaseStatusPicker";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, SlidersHorizontal } from "lucide-react";

type PendingDecision = { kind: "go" | "nogo"; detail: string };

function statusTone(status?: string | null): ChipTone {
  const normalized = (status ?? "").toLowerCase();
  if (normalized.includes("block") || normalized.includes("reject") || normalized.includes("cancel"))
    return "bad";
  if (normalized.includes("risk") || normalized.includes("hold") || normalized.includes("defer"))
    return "warn";
  if (
    normalized.includes("deploy") ||
    normalized.includes("closed") ||
    normalized.includes("approv")
  )
    return "good";
  if (normalized.includes("plan") || normalized.includes("draft") || normalized.includes("test"))
    return "info";
  return "neutral";
}

export type ReleaseActionStripProps = {
  releaseId: string;
  status: string;
  decision?: string | null;
  canEdit: boolean;
  refreshKey?: number;
  onStatusChanged: () => void;
  onRecordDecision: (detail: string) => void;
};

/**
 * Release controls — config-driven status picker and Go / No-Go confirmation.
 */
export function ReleaseActionStrip({
  releaseId,
  status,
  decision,
  canEdit,
  refreshKey = 0,
  onStatusChanged,
  onRecordDecision,
}: ReleaseActionStripProps) {
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setPending(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, busy]);

  const confirmPending = () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      onRecordDecision(pending.detail);
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const dialog =
    pending == null
      ? null
      : pending.kind === "go"
        ? {
            title: "Record Go decision?",
            description:
              "This marks the release as approved for deployment. Confirm only if blockers are cleared and sign-offs are in place.",
            confirmLabel: "Confirm Go",
            tone: "go" as const,
            icon: CheckCircle2,
          }
        : {
            title: "Record No-Go decision?",
            description:
              "This records a formal No-Go. The release stays blocked until someone records a Go or clears the blocking issues.",
            confirmLabel: "Confirm No-Go",
            tone: "nogo" as const,
            icon: XCircle,
          };

  return (
    <>
      <div
        id="go-nogo"
        className="w-full scroll-mt-24 rounded-[22px] border border-slate-100/80 border-l-[4px] border-l-violet-500 bg-white px-5 py-5 shadow-[0_16px_36px_-24px_rgba(112,144,176,0.25)] dark:border-[var(--border)] dark:bg-[var(--card)] dark:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.55)] sm:px-6 sm:py-5"
      >
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
            <SlidersHorizontal size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-slate-800 dark:text-white">Release controls</p>
            <p className="text-[12px] text-slate-400 dark:text-white/45">
              Legal next statuses from your lifecycle config, plus Go / No-Go
            </p>
          </div>
          <InfoTooltip
            label="About release controls"
            text="Status changes only offer legal next steps from the lifecycle configuration, with gate feedback. Flexible unmet gates need an override reason. Go / No-Go decisions still ask for confirmation and are audited."
          />
        </div>

        <div className="space-y-5">
          <div>
            <HoverExplain
              text="Only statuses allowed by the lifecycle graph from the current status are shown. Soft gates warn; hard gates block."
              label="About status"
            >
              <span className="mb-2 inline-block cursor-help text-[11px] font-bold uppercase tracking-wider text-slate-400 underline decoration-dotted decoration-slate-300 underline-offset-2">
                Status
              </span>
            </HoverExplain>
            <ReleaseStatusPicker
              releaseId={releaseId}
              status={status}
              canEdit={canEdit}
              refreshKey={refreshKey}
              onStatusChanged={onStatusChanged}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-[var(--border)]">
            <HoverExplain
              text="Formal Go / No-Go decision for deployment. Recording Go or No-Go is confirmed in a dialog and written to the Audit Trail with your name."
              label="About decision"
            >
              <span className="cursor-help text-[11px] font-bold uppercase tracking-wider text-slate-400 underline decoration-dotted decoration-slate-300 underline-offset-2">
                Decision
              </span>
            </HoverExplain>
            <StatusChip tone={statusTone(decision)} label={decision ?? "No decision yet"} />
            {canEdit && (
              <>
                <button
                  type="button"
                  className={cn(
                    taBtnPrimary,
                    "!bg-emerald-600 !px-5 !py-2.5 !text-[13px] !font-semibold transition-transform duration-150 hover:!bg-emerald-700 active:scale-[0.97]"
                  )}
                  onClick={() =>
                    setPending({
                      kind: "go",
                      detail: "Go — approved for deployment",
                    })
                  }
                >
                  Record Go
                </button>
                <button
                  type="button"
                  className={cn(
                    taBtnPrimary,
                    "!bg-rose-600 !px-5 !py-2.5 !text-[13px] !font-semibold transition-transform duration-150 hover:!bg-rose-700 active:scale-[0.97]"
                  )}
                  onClick={() =>
                    setPending({ kind: "nogo", detail: "No-Go — blocked" })
                  }
                >
                  Record No-Go
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {dialog && pending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="release-decision-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-[var(--card)]">
            <div className="mb-3 flex items-center gap-2">
              <dialog.icon
                className={cn(
                  dialog.tone === "go" ? "text-emerald-600" : "text-rose-600"
                )}
                size={20}
              />
              <h2
                id="release-decision-title"
                className="text-base font-bold text-slate-900 dark:text-white"
              >
                {dialog.title}
              </h2>
            </div>
            <p className="mb-5 text-sm text-slate-600 dark:text-white/65">{dialog.description}</p>
            <div className="flex justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                className={taBtnSecondary}
                disabled={busy}
                onClick={() => setPending(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={cn(
                  taBtnPrimary,
                  dialog.tone === "go" ? "!bg-emerald-600" : "!bg-rose-600"
                )}
                disabled={busy}
                onClick={confirmPending}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
