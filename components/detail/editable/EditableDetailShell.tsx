"use client";

import type { ReactNode } from "react";
import { Edit3, Trash2 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { useNavHistoryLabel } from "@/context/NavigationHistoryContext";
import { ConfirmDeleteDialog } from "@/components/detail/editable/ConfirmDeleteDialog";
import { DetailEditModal } from "@/components/detail/editable/DetailEditModal";
import { EditSuccessDialog } from "@/components/detail/editable/EditSuccessDialog";
import type { ChipTone } from "@/components/detail/editable/StatusChip";
import type { FieldChange } from "@/lib/detail-edit-diff";
import { taInput } from "@/lib/styles";
import { cn, formatDateTime } from "@/lib/utils";

export type EntitySelectOption = { value: string; label: string };

/** Large centered status shown between the entity switcher and edit/delete. */
export type EditableDetailHeaderStatus = {
  label: string;
  tone?: ChipTone;
  caption?: string;
};

const HEADER_STATUS_TONE: Record<ChipTone, string> = {
  neutral:
    "bg-slate-100 text-slate-800 ring-slate-300 dark:bg-white/10 dark:text-white dark:ring-white/25",
  good: "bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-500/40",
  warn: "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-500/20 dark:text-amber-100 dark:ring-amber-500/40",
  bad: "bg-rose-100 text-rose-800 ring-rose-300 dark:bg-rose-500/20 dark:text-rose-200 dark:ring-rose-500/40",
  info: "bg-indigo-100 text-indigo-800 ring-indigo-300 dark:bg-indigo-500/20 dark:text-indigo-200 dark:ring-indigo-500/40",
};

type EditableDetailShellProps = {
  pageTitle: string;
  /** 1–2 line plain-language description of what this record type is and why it matters. */
  pageDescription?: string;
  entityLabel: string;
  entityCode: string;
  /** Optional display name under the code (e.g. release name). */
  entityName?: string;
  selectLabel: string;
  selectValue: string;
  selectOptions: EntitySelectOption[];
  onSelectChange: (value: string) => void;
  /**
   * Optional prominent status between Select and Edit/Delete (e.g. Blocker Open).
   * Centered and large on desktop; full-width centered on small screens.
   */
  headerStatus?: EditableDetailHeaderStatus | null;
  lastRefresh: Date;
  footer: string;
  /** When true, the edit modal is open. */
  editing: boolean;
  canEdit: boolean;
  saving?: boolean;
  deleting?: boolean;
  /** @deprecated Prefer successChanges dialog; kept for transitional banners. */
  saveMessage?: string | null;
  editError?: string | null;
  /** Clears editError when the error popup is dismissed (modal stays open). */
  onClearEditError?: () => void;
  onEdit: () => void;
  onDiscard: () => void;
  onSave: () => void;
  deleteOpen: boolean;
  onDeleteOpen: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
  /** Locked primary ID shown at the top of the edit modal. */
  lockedIdLabel: string;
  /** Form fields rendered inside the edit modal (always in edit mode). */
  editForm: ReactNode;
  /** Field-level changes after a successful save; null hides the dialog. */
  successChanges?: FieldChange[] | null;
  onSuccessDismiss?: () => void;
  relatedLinks?: ReactNode;
  children: ReactNode;
};

/**
 * Shared chrome for editable detail pages.
 * Edit opens a modal; save success shows a confirmation of changed fields.
 * Entity switcher sits beside the heading so it does not consume a full card row.
 *
 * @param props - Page chrome, select switcher, edit/delete controls, and body.
 * @returns Detail page shell.
 */
export function EditableDetailShell({
  pageTitle,
  pageDescription,
  entityLabel,
  entityCode,
  entityName,
  selectLabel,
  selectValue,
  selectOptions,
  onSelectChange,
  headerStatus = null,
  lastRefresh,
  footer,
  editing,
  canEdit,
  saving = false,
  deleting = false,
  saveMessage,
  editError,
  onClearEditError,
  onEdit,
  onDiscard,
  onSave,
  deleteOpen,
  onDeleteOpen,
  onDeleteCancel,
  onDeleteConfirm,
  lockedIdLabel,
  editForm,
  successChanges = null,
  onSuccessDismiss,
  relatedLinks,
  children,
}: EditableDetailShellProps) {
  useNavHistoryLabel(entityCode);
  const statusTone = headerStatus?.tone ?? "neutral";

  return (
    <div className="w-full min-w-0 space-y-5">
      <TopBar title={pageTitle} highlight />

      <div
        className={cn(
          "grid items-start gap-4",
          headerStatus
            ? "grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center"
            : "grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto]"
        )}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[22px] font-bold tracking-tight text-[#1B2559] dark:text-white md:text-[26px]">
              {entityName ?? entityCode}
            </h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-500 dark:bg-white/10 dark:text-white/60">
              {entityCode}
            </span>
            <label className="flex min-w-0 items-center gap-2 text-sm text-slate-700 dark:text-white/80">
              <span className="hidden text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45 sm:inline">
                {selectLabel}
              </span>
              <select
                aria-label={selectLabel}
                className={cn(
                  taInput,
                  "min-w-0 max-w-[160px] rounded-xl py-1.5 font-mono text-xs sm:max-w-[200px]"
                )}
                value={selectValue}
                disabled={editing}
                onChange={(e) => onSelectChange(e.target.value)}
              >
                {(selectOptions.length ? selectOptions : [{ value: selectValue, label: entityCode }]).map(
                  (o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  )
                )}
              </select>
            </label>
          </div>
          {pageDescription ? (
            <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-slate-500 dark:text-white/60">
              {pageDescription}
            </p>
          ) : null}
          <p className="mt-1 text-[12.5px] text-slate-400 dark:text-white/50">
            Last refresh {formatDateTime(lastRefresh.toISOString())}
          </p>
        </div>

        {headerStatus ? (
          <div className="flex w-full flex-col items-center justify-center text-center md:px-2">
            <span
              className={cn(
                "inline-flex max-w-full items-center justify-center rounded-2xl px-5 py-2.5 text-base font-extrabold tracking-tight shadow-sm ring-2 sm:px-7 sm:py-3 sm:text-xl md:text-2xl",
                HEADER_STATUS_TONE[statusTone]
              )}
              role="status"
              aria-label={`Status: ${headerStatus.label}`}
            >
              {headerStatus.label}
            </span>
            {headerStatus.caption ? (
              <span className="mt-1.5 max-w-[16rem] text-[11px] font-medium text-slate-500 dark:text-white/55 sm:text-xs">
                {headerStatus.caption}
              </span>
            ) : null}
          </div>
        ) : null}

        {canEdit ? (
          <div
            className={cn(
              "flex flex-wrap items-center gap-2",
              headerStatus ? "justify-center md:justify-end" : "justify-start md:justify-end"
            )}
          >
            <button
              type="button"
              onClick={onDeleteOpen}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600 dark:text-white/45 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
            >
              <Trash2 size={14} aria-hidden />
              Delete
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all duration-150 hover:bg-brand-600 hover:shadow-md active:scale-[0.97]"
              style={{ boxShadow: "var(--theme-shadow)" }}
            >
              <Edit3 size={14} aria-hidden />
              Edit {entityLabel}
            </button>
          </div>
        ) : headerStatus ? (
          <div className="hidden md:block" aria-hidden />
        ) : null}
      </div>

      {saveMessage && !editing && successChanges == null && (
        <div
          role="status"
          className="rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-800 ring-1 ring-emerald-200 transition-all duration-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30"
        >
          {saveMessage}
        </div>
      )}

      {children}

      {relatedLinks ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
            Related
          </span>
          {relatedLinks}
        </div>
      ) : null}

      <p className="pb-2 text-center text-[11px] text-slate-400 dark:text-white/40">{footer}</p>

      <DetailEditModal
        open={editing}
        title={`Edit ${entityLabel}`}
        lockedIdLabel={lockedIdLabel}
        lockedIdValue={entityCode}
        saving={saving}
        error={editError}
        onClearError={onClearEditError}
        onCancel={onDiscard}
        onSave={onSave}
      >
        {editForm}
      </DetailEditModal>

      <EditSuccessDialog
        open={successChanges != null}
        entityLabel={entityLabel}
        entityCode={entityCode}
        changes={successChanges ?? []}
        onDone={onSuccessDismiss ?? (() => undefined)}
      />

      <ConfirmDeleteDialog
        open={deleteOpen}
        entityLabel={entityLabel}
        entityCode={entityCode}
        busy={deleting}
        onCancel={onDeleteCancel}
        onConfirm={onDeleteConfirm}
      />
    </div>
  );
}
