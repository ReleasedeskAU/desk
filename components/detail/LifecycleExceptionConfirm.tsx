/**
 * Shared confirm panel for lifecycle status changes that may need an exception reason.
 * Matches Release status-picker layout so Flexible overrides look the same everywhere.
 */
"use client";

import { useEffect, type RefObject } from "react";
import { AlertTriangle, Lock, RefreshCw } from "lucide-react";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";

export type LifecycleExceptionCheck = {
  /** Short check name shown in bold. */
  label: string;
  passed: boolean;
  /** Unmet explanation when not passed. */
  reason?: string;
  /** Required check — no exception allowed. */
  hard?: boolean;
  /** Flexible check — exception reason allowed. */
  soft?: boolean;
};

export type LifecycleExceptionConfirmProps = {
  targetLabel: string;
  /** When true, title uses “Return to …” wording. */
  isReturn?: boolean;
  checks?: LifecycleExceptionCheck[];
  needsException: boolean;
  blocked: boolean;
  exceptionReason: string;
  onExceptionReasonChange: (value: string) => void;
  busy: boolean;
  confirmDisabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** Optional lead line above the check list (e.g. API summary). */
  leadMessage?: string | null;
  /** Override the exception textarea label. */
  reasonLabel?: string;
  /** Override the exception textarea placeholder. */
  reasonPlaceholder?: string;
  /** Focus the reason field when the panel appears (Edit Release). */
  autoFocusReason?: boolean;
  /** Optional ref to the reason textarea for scroll/focus from parents. */
  reasonInputRef?: RefObject<HTMLTextAreaElement | null>;
};

/**
 * Inline confirm + exception-reason panel (Release-parity layout).
 */
export function LifecycleExceptionConfirm({
  targetLabel,
  isReturn = false,
  checks = [],
  needsException,
  blocked,
  exceptionReason,
  onExceptionReasonChange,
  busy,
  confirmDisabled,
  onCancel,
  onConfirm,
  leadMessage,
  reasonLabel,
  reasonPlaceholder,
  autoFocusReason = false,
  reasonInputRef,
}: LifecycleExceptionConfirmProps) {
  // Surface the reason field immediately when Flexible gates need an exception.
  useEffect(() => {
    if (!needsException || !autoFocusReason) return;
    const el = reasonInputRef?.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [autoFocusReason, needsException, reasonInputRef, targetLabel]);

  return (
    <div
      className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-[var(--border)] dark:bg-white/5"
      data-lifecycle-exception-panel
    >
      <div className="mb-2 flex items-center gap-2">
        <RefreshCw size={16} className="text-violet-600" aria-hidden />
        <p className="text-sm font-semibold text-slate-800 dark:text-white">
          {isReturn ? `Return to ${targetLabel}?` : `Change to ${targetLabel}?`}
        </p>
      </div>

      {leadMessage ? (
        <p className="mb-3 text-sm text-slate-600 dark:text-white/70">{leadMessage}</p>
      ) : null}

      {checks.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {checks.map((check) => (
            <li
              key={`${check.label}-${check.reason ?? ""}`}
              className={cn(
                "flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs",
                check.passed
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"
                  : check.hard
                    ? "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"
                    : "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100"
              )}
            >
              {check.hard ? (
                <Lock size={12} className="mt-0.5 shrink-0" aria-hidden />
              ) : check.soft || !check.passed ? (
                <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
              ) : (
                <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              )}
              <span>
                <span className="font-semibold">{check.label}</span>
                {" — "}
                {check.passed ? "met" : check.reason}
                {!check.passed && check.soft
                  ? " (can continue with a reason)"
                  : ""}
                {!check.passed && check.hard
                  ? " (must fix first — no exception)"
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      {needsException && (
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-white/60">
            {reasonLabel ?? "Exception reason (required)"}
          </span>
          <textarea
            ref={reasonInputRef}
            id="lifecycle-exception-reason"
            value={exceptionReason}
            onChange={(e) => onExceptionReasonChange(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-[var(--border)] dark:bg-[var(--card)] dark:text-white"
            placeholder={
              reasonPlaceholder ??
              (needsException
                ? "Briefly explain why you’re taking this step (this is recorded)."
                : "Briefly explain why you’re continuing without meeting the checks (this is recorded).")
            }
          />
        </label>
      )}

      {blocked && (
        <p className="mb-3 text-sm text-rose-600 dark:text-rose-300">
          This status change is blocked. Required checks aren’t met, and this step
          doesn’t allow an exception. Fix the items listed, then try again.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={taBtnSecondary}
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className={taBtnPrimary}
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {busy
            ? "Updating…"
            : needsException
              ? "Continue anyway"
              : `Confirm ${targetLabel}`}
        </button>
      </div>
    </div>
  );
}
