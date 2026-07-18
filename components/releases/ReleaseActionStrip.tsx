"use client";

import { useEffect, useRef, useState } from "react";
import { StatusChip, type ChipTone } from "@/components/detail/editable";
import { HoverExplain, InfoTooltip } from "@/components/ui/InfoTooltip";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { CheckCircle2, RefreshCw, SlidersHorizontal, XCircle } from "lucide-react";

const STATUSES = ["Planned", "In Progress", "Blocked", "At Risk", "Complete"] as const;

type PendingAction =
  | { type: "status"; nextStatus: string }
  | { type: "decision"; kind: "go" | "nogo"; detail: string };

function statusTone(status?: string | null): ChipTone {
  const normalized = (status ?? "").toLowerCase();
  if (normalized.includes("block")) return "bad";
  if (normalized.includes("risk") || normalized.includes("hold") || normalized.includes("progress")) return "warn";
  if (normalized.includes("complete") || normalized.includes("ready") || normalized.includes("approve")) return "good";
  if (normalized.includes("plan")) return "info";
  return "neutral";
}

export type ReleaseActionStripProps = {
  status: string;
  decision?: string | null;
  canEdit: boolean;
  onPatchStatus: (status: string) => void;
  onRecordDecision: (detail: string) => void;
};

/**
 * Release controls — status chips and Go / No-Go, both behind confirmation.
 *
 * @param props - Current status/decision and action handlers.
 * @returns Prominent controls strip with confirm dialogs for critical changes.
 */
export function ReleaseActionStrip({
  status,
  decision,
  canEdit,
  onPatchStatus,
  onRecordDecision,
}: ReleaseActionStripProps) {
  const [pending, setPending] = useState<PendingAction | null>(null);
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

  const requestStatusChange = (nextStatus: string) => {
    if (nextStatus === status) return;
    setPending({ type: "status", nextStatus });
  };

  const confirmPending = () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      if (pending.type === "status") {
        onPatchStatus(pending.nextStatus);
      } else {
        onRecordDecision(pending.detail);
      }
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const dialog =
    pending == null
      ? null
      : pending.type === "status"
        ? {
            title: `Change status to ${pending.nextStatus}?`,
            description: `This updates the release from "${status}" to "${pending.nextStatus}". The change is recorded in the Audit Trail with your name.`,
            confirmLabel: `Confirm ${pending.nextStatus}`,
            tone: "indigo" as const,
            icon: RefreshCw,
          }
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
              Set status and record a formal Go / No-Go decision
            </p>
          </div>
          <InfoTooltip
            label="About release controls"
            text="Status changes and Go / No-Go decisions both ask for confirmation before saving. Each change is written to the Audit Trail with your name. Related pages like Calendar and Env Booking are available from the left sidebar."
          />
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <HoverExplain
              text="Current lifecycle status of this release. Changing status asks for confirmation and is logged in the Audit Trail."
              label="About status"
            >
              <span className="mr-1 cursor-help text-[11px] font-bold uppercase tracking-wider text-slate-400 underline decoration-dotted decoration-slate-300 underline-offset-2">
                Status
              </span>
            </HoverExplain>
            {canEdit ? (
              STATUSES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => requestStatusChange(item)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-150 active:scale-[0.97]",
                    status === item
                      ? "border-indigo-600 bg-indigo-600 text-white shadow-sm shadow-indigo-200 dark:shadow-indigo-900/40"
                      : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-[var(--border)] dark:bg-white/5 dark:text-white/65"
                  )}
                >
                  {item}
                </button>
              ))
            ) : (
              <StatusChip label={status} tone={statusTone(status)} />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <HoverExplain
              text="Formal Go / No-Go decision for deployment. Recording Go or No-Go is confirmed in a dialog and written to the Audit Trail with your name."
              label="About decision"
            >
              <span className="cursor-help text-[11px] font-bold uppercase tracking-wider text-slate-400 underline decoration-dotted decoration-slate-300 underline-offset-2">
                Decision
              </span>
            </HoverExplain>
            <StatusChip label={decision ?? "No decision yet"} tone={statusTone(decision)} />
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
                      type: "decision",
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
                    setPending({ type: "decision", kind: "nogo", detail: "No-Go — blocked" })
                  }
                >
                  Record No-Go
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {pending && dialog ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => !busy && setPending(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-control-title"
            aria-describedby="confirm-control-desc"
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)] dark:border-[var(--border)] dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  dialog.tone === "go" &&
                    "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
                  dialog.tone === "nogo" &&
                    "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
                  dialog.tone === "indigo" &&
                    "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
                )}
              >
                <dialog.icon className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <h2
                  id="confirm-control-title"
                  className="text-base font-semibold text-gray-900 dark:text-white"
                >
                  {dialog.title}
                </h2>
                <p
                  id="confirm-control-desc"
                  className="mt-1 text-sm text-gray-600 dark:text-white/65"
                >
                  {dialog.description}
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                disabled={busy}
                onClick={() => setPending(null)}
                className={cn(taBtnSecondary, "transition-transform duration-150 active:scale-[0.97]")}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmPending}
                className={cn(
                  taBtnPrimary,
                  "transition-transform duration-150 active:scale-[0.97]",
                  dialog.tone === "go" && "!bg-emerald-600 hover:!bg-emerald-700",
                  dialog.tone === "nogo" && "!bg-rose-600 hover:!bg-rose-700",
                  dialog.tone === "indigo" && "!bg-indigo-600 hover:!bg-indigo-700"
                )}
              >
                {busy ? "Saving…" : dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
