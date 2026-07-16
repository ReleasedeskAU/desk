"use client";

import { CheckCircle2 } from "lucide-react";
import type { FieldChange } from "@/lib/detail-edit-diff";
import { taBtnPrimary } from "@/lib/styles";

type EditSuccessDialogProps = {
  open: boolean;
  entityLabel: string;
  entityCode: string;
  changes: FieldChange[];
  onDone: () => void;
};

/**
 * Post-save confirmation showing which fields changed.
 */
export function EditSuccessDialog({
  open,
  entityLabel,
  entityCode,
  changes,
  onDone,
}: EditSuccessDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onDone}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-theme-lg dark:bg-[var(--card)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-success-title"
      >
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id="edit-success-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              Changes saved
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-white/60">
              {entityLabel} <span className="font-mono text-xs">{entityCode}</span> was updated
              successfully.
            </p>
          </div>
        </div>

        {changes.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm text-gray-600 dark:border-[var(--border)] dark:bg-white/5 dark:text-white/65">
            No field values changed.
          </p>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-gray-200 bg-gray-50/80 dark:border-[var(--border)] dark:bg-white/5">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-gray-100 text-[11px] uppercase tracking-wide text-gray-500 dark:bg-white/10 dark:text-white/50">
                <tr>
                  <th className="px-3 py-2 font-semibold">Field</th>
                  <th className="px-3 py-2 font-semibold">From</th>
                  <th className="px-3 py-2 font-semibold">To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/80 dark:divide-white/10">
                {changes.map((c) => (
                  <tr key={c.label}>
                    <td className="px-3 py-2.5 font-medium text-gray-800 dark:text-white">{c.label}</td>
                    <td className="max-w-[140px] truncate px-3 py-2.5 text-gray-500 dark:text-white/55" title={c.from}>
                      {c.from}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2.5 font-medium text-emerald-700 dark:text-emerald-300" title={c.to}>
                      {c.to}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button type="button" className={taBtnPrimary} onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
