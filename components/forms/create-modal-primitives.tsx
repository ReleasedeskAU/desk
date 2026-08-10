"use client";

import { CheckCircle2 } from "lucide-react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import { buildFormSaveAlert } from "@/lib/form-save-alert";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

export function ModalFrame({
  children,
  onClose,
  labelledBy,
  wide = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  labelledBy: string;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-theme-lg dark:bg-[var(--card)]",
          wide ? "max-w-2xl" : "max-w-lg"
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function RequiredMark() {
  return <span className="text-rose-500">*</span>;
}

/**
 * Save/API error as a popup (not an inline banner).
 * @param message - Error text to show.
 * @param onDismiss - Clears parent formError state; required so the dialog can close.
 * @param title - Optional override; lifecycle messages auto-title via buildFormSaveAlert when used upstream.
 */
export function FormError({
  message,
  onDismiss,
  title,
}: {
  message: string;
  onDismiss: () => void;
  title?: string;
}) {
  const alert = buildFormSaveAlert(null, message, { entityLabel: "record" });
  return (
    <FormAlertDialog
      alert={title ? { ...alert, title } : alert}
      onDismiss={onDismiss}
    />
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">{message}</p>
  ) : null;
}

export function SelectField({
  label,
  required,
  error,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  return (
    <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
      {label}
      {required ? (
        <>
          {" "}
          <RequiredMark />
        </>
      ) : null}
      <select {...props} className={cn(taInput, "mt-1", error && "border-rose-400")}>
        {children}
      </select>
      <FieldError message={error} />
    </label>
  );
}

export function TextField({
  label,
  required,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
      {label}
      {required ? (
        <>
          {" "}
          <RequiredMark />
        </>
      ) : null}
      <input {...props} className={cn(taInput, "mt-1", error && "border-rose-400")} />
      <FieldError message={error} />
    </label>
  );
}

export function TextareaField({
  label,
  required,
  error,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  return (
    <label className="block text-xs font-medium text-gray-600 dark:text-white/70 sm:col-span-2">
      {label}
      {required ? (
        <>
          {" "}
          <RequiredMark />
        </>
      ) : null}
      <textarea
        {...props}
        maxLength={4000}
        className={cn(taInput, "mt-1 min-h-[76px]", error && "border-rose-400")}
      />
      <FieldError message={error} />
    </label>
  );
}

export function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500 dark:text-white/55">{label}</dt>
      <dd
        className={cn(
          "max-w-[70%] text-right font-medium text-gray-900 dark:text-white",
          mono && "font-mono text-xs"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

type CreatedConfirmationProps = {
  title: string;
  subtitle: string;
  labelledBy: string;
  onClose: () => void;
  onCreateAnother: () => void;
  viewHref?: string;
  viewLabel?: string;
  rows: Array<{ label: string; value: string; mono?: boolean }>;
};

/** Standard post-create confirmation with summary, view link, and create-another. */
export function CreatedConfirmation({
  title,
  subtitle,
  labelledBy,
  onClose,
  onCreateAnother,
  viewHref,
  viewLabel,
  rows,
}: CreatedConfirmationProps) {
  return (
    <ModalFrame onClose={onClose} labelledBy={labelledBy}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 id={labelledBy} className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-white/60">{subtitle}</p>
        </div>
      </div>
      <dl className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm dark:border-[var(--border)] dark:bg-white/5">
        {rows.map((row) => (
          <SummaryRow key={row.label} label={row.label} value={row.value} mono={row.mono} />
        ))}
      </dl>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className={taBtnSecondary} onClick={onCreateAnother}>
          Create another
        </button>
        {viewHref && viewLabel ? (
          <ProgressLink href={viewHref} className={cn(taBtnSecondary, "inline-flex items-center")}>
            {viewLabel}
          </ProgressLink>
        ) : null}
        <button type="button" className={taBtnPrimary} onClick={onClose}>
          Close
        </button>
      </div>
    </ModalFrame>
  );
}
