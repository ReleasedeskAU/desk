"use client";

import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";

export const mappingInputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-[var(--border)] dark:bg-[var(--card)] dark:text-white";

/** Accessible modal used by System Mapping editors. */
export function SystemMappingModal({
  open,
  title,
  submitting,
  error,
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  title: string;
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, submitting]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-gray-950/50"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-mapping-dialog-title"
        className="relative max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-[var(--border)] dark:bg-[var(--card)]"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4 dark:border-[var(--border)] dark:bg-[var(--card)]">
          <h2 id="system-mapping-dialog-title" className="text-lg font-bold text-gray-900 dark:text-white">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          {children}
          {error && (
            <p role="alert" className="rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-300">
              {error}
            </p>
          )}
          <footer className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-[var(--border)] dark:text-gray-200 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

/** Label wrapper for strict System Mapping form fields. */
export function MappingFormField({
  label,
  required = true,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-200">
        {label}
        {required && <span className="text-error-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
