"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";

type ConfirmDeleteDialogProps = {
  open: boolean;
  entityLabel: string;
  entityCode: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Explicit delete confirmation — primary action is Cancel; Delete is quieter until hover.
 */
export function ConfirmDeleteDialog({
  open,
  entityLabel,
  entityCode,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] transition-opacity duration-200"
      role="presentation"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-desc"
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)] transition-transform duration-200 dark:border-[var(--border)] dark:bg-[var(--card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 id="confirm-delete-title" className="text-base font-semibold text-gray-900 dark:text-white">
              Delete {entityLabel}?
            </h2>
            <p id="confirm-delete-desc" className="mt-1 text-sm text-gray-600 dark:text-white/65">
              This permanently removes{" "}
              <span className="font-mono font-medium text-gray-800 dark:text-white/90">{entityCode}</span>. This
              cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className={cn(taBtnPrimary, "active:scale-[0.97] transition-transform duration-150")}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={cn(
              taBtnSecondary,
              "border-transparent text-rose-600 hover:border-rose-200 hover:bg-rose-50 dark:text-rose-300 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10",
              "active:scale-[0.97] transition-all duration-150"
            )}
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
