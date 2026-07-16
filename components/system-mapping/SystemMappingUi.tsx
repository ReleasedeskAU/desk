"use client";

import { AlertCircle, Loader2, Pencil, Plus, Trash2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Standard visible create action for editable System Mapping sections. */
export function AddMappingRecordButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
    >
      <Plus className="h-4 w-4" />
      {label}
    </button>
  );
}

/** Always-visible edit and delete controls for touch and keyboard users. */
export function MappingRecordActions({
  label,
  onEdit,
  onDelete,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${label}`}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-[var(--border)] dark:text-gray-200 dark:hover:bg-brand-500/10 dark:hover:text-brand-300"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${label}`}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-error-200 px-2.5 py-1.5 text-xs font-semibold text-error-700 transition hover:bg-error-50 dark:border-error-500/30 dark:text-error-300 dark:hover:bg-error-500/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>
    </div>
  );
}

/** Consistent section heading used inside each mapping tab. */
export function MappingSectionHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

/** Loading state for tab content. */
export function MappingLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
      <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
      {label}
    </div>
  );
}

/** Error state with an explicit retry action. */
export function MappingError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-error-200 bg-error-50/60 p-6 text-center dark:bg-error-500/10">
      <AlertCircle className="mb-2 h-7 w-7 text-error-500" />
      <p className="text-sm font-medium text-error-700 dark:text-error-300">{message}</p>
      <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-error-300 px-3 py-1.5 text-sm font-semibold text-error-700 hover:bg-error-100 dark:text-error-300">
        Retry
      </button>
    </div>
  );
}

/** Empty state for database-backed mapping records. */
export function MappingEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500 dark:border-[var(--border)] dark:text-gray-400">
      {message}
    </div>
  );
}
