"use client";

/**
 * Modal popup for form/save errors (lifecycle blocks, validation, API failures).
 * Renders above edit/create modals so messages are not buried in scrollable form bodies.
 */
import { AlertTriangle } from "lucide-react";
import type { FormAlert } from "@/lib/form-save-alert";
import { taBtnPrimary } from "@/lib/styles";

type FormAlertDialogProps = {
  alert: FormAlert | null;
  onDismiss: () => void;
};

/**
 * Blocking alert dialog for save/lifecycle errors.
 * @param alert - Payload to show; null hides the dialog.
 * @param onDismiss - Called when OK or backdrop is activated.
 */
export function FormAlertDialog({ alert, onDismiss }: FormAlertDialogProps) {
  if (!alert) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onDismiss}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-theme-lg dark:bg-[var(--card)]"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="form-alert-title"
        aria-describedby="form-alert-message"
      >
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2
              id="form-alert-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              {alert.title}
            </h2>
            <p
              id="form-alert-message"
              className="mt-1 text-sm text-gray-600 dark:text-white/70"
            >
              {alert.message}
            </p>
          </div>
        </div>

        {alert.details && alert.details.length > 0 ? (
          <ul className="mb-4 list-disc space-y-1 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 pl-8 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100">
            {alert.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex justify-end">
          <button type="button" className={taBtnPrimary} onClick={onDismiss}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
