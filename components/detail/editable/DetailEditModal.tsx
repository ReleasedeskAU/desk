"use client";

import type { ReactNode } from "react";
import { Save, X } from "lucide-react";
import { LockedIdField } from "@/components/detail/editable/EditableField";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import { buildFormSaveAlert } from "@/lib/form-save-alert";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";

type DetailEditModalProps = {
  open: boolean;
  title: string;
  /** Primary code shown locked — never part of the save payload. */
  lockedIdLabel: string;
  lockedIdValue: string;
  saving?: boolean;
  error?: string | null;
  /** Clears the error when the popup is dismissed (keeps the edit modal open). */
  onClearError?: () => void;
  onCancel: () => void;
  onSave: () => void;
  children: ReactNode;
};

/**
 * Modal form for editing a detail record.
 * Primary ID is displayed locked; callers must omit it from PATCH bodies.
 * Save/lifecycle errors open a popup above the form (not inline).
 */
export function DetailEditModal({
  open,
  title,
  lockedIdLabel,
  lockedIdValue,
  saving = false,
  error,
  onClearError,
  onCancel,
  onSave,
  children,
}: DetailEditModalProps) {
  if (!open) return null;

  const entityLabel =
    title.replace(/^Edit\s+/i, "").trim().toLowerCase() || "record";
  const alert = error?.trim()
    ? buildFormSaveAlert(null, error.trim(), { entityLabel })
    : null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={onCancel}
        role="presentation"
      >
        <div
          className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-theme-lg dark:bg-[var(--card)]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-edit-title"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-[var(--border)]">
            <div>
              <h2
                id="detail-edit-title"
                className="text-lg font-semibold text-gray-900 dark:text-white"
              >
                {title}
              </h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-white/55">
                Update details below. The primary ID cannot be changed.
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-[var(--border)] dark:bg-white/5">
              <LockedIdField label={lockedIdLabel} value={lockedIdValue} />
            </div>
            <div className="space-y-4">{children}</div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-[var(--border)]">
            <button
              type="button"
              className={taBtnSecondary}
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className={cn(taBtnPrimary, "inline-flex items-center gap-1.5")}
              onClick={onSave}
              disabled={saving}
            >
              <Save className="h-4 w-4" aria-hidden />
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>

      <FormAlertDialog
        alert={alert}
        onDismiss={() => {
          onClearError?.();
        }}
      />
    </>
  );
}
