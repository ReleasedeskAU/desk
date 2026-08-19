"use client";

import { CheckCircle2 } from "lucide-react";
import { createPortal } from "react-dom";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";

/** Shared accessible modal shell for entity create flows. */
export function CreateModalShell({
  title,
  description,
  onClose,
  children,
  footer,
  labelledBy = "create-modal-title",
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Pinned under the scroll area so Cancel / Save stay visible. */
  footer?: React.ReactNode;
  labelledBy?: string;
}) {
  const dialog = (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-x-hidden overflow-y-auto bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="my-auto flex w-full min-w-0 max-h-[min(90dvh,52rem)] max-w-[min(42rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-[var(--card)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <div className="shrink-0 border-b border-gray-200 px-5 py-4 dark:border-[var(--border)]">
          <h2 id={labelledBy} className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-white/55">{description}</p>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-[var(--border)]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}

/** Required-field marker used by create forms. */
export function RequiredMark() {
  return <span className="text-rose-500"> *</span>;
}

/** Inline validation message for a single form field. */
export function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">{message}</p> : null;
}

/** Key/value row used in post-create confirmation summaries. */
export function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500 dark:text-white/55">{label}</dt>
      <dd className={cn("text-right font-medium text-gray-900 dark:text-white", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}

/** Post-create confirmation that keeps list refresh separate from dismissal. */
export function CreateConfirmation({
  entity,
  viewHref,
  onClose,
  onCreateAnother,
  children,
}: {
  entity: string;
  viewHref: string;
  onClose: () => void;
  onCreateAnother: () => void;
  children: React.ReactNode;
}) {
  return (
    <CreateModalShell
      title={`${entity} created`}
      description={`Your ${entity.toLowerCase()} was saved successfully.`}
      onClose={onClose}
      labelledBy="create-confirmation-title"
      footer={
        <>
          <button type="button" className={taBtnSecondary} onClick={onCreateAnother}>
            Create another
          </button>
          <ProgressLink href={viewHref} className={cn(taBtnSecondary, "inline-flex items-center")}>
            View record
          </ProgressLink>
          <button type="button" className={taBtnPrimary} onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
        </span>
        Creation completed
      </div>
      <dl className="mt-4 space-y-2 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm dark:border-[var(--border)] dark:bg-white/5">
        {children}
      </dl>
    </CreateModalShell>
  );
}
