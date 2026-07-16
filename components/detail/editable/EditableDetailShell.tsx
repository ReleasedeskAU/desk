"use client";

import type { ReactNode } from "react";
import { Edit3, Trash2 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { useNavHistoryLabel } from "@/context/NavigationHistoryContext";
import { ConfirmDeleteDialog } from "@/components/detail/editable/ConfirmDeleteDialog";
import { DetailEditModal } from "@/components/detail/editable/DetailEditModal";
import { EditSuccessDialog } from "@/components/detail/editable/EditSuccessDialog";
import type { FieldChange } from "@/lib/detail-edit-diff";
import { taInput } from "@/lib/styles";
import { cn, formatDateTime } from "@/lib/utils";

export type EntitySelectOption = { value: string; label: string };

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
  lastRefresh,
  footer,
  editing,
  canEdit,
  saving = false,
  deleting = false,
  saveMessage,
  editError,
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

  return (
    <div className="space-y-5">
      <TopBar title={pageTitle} highlight />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[22px] font-bold tracking-tight text-[#1B2559] dark:text-white md:text-[26px]">
              {entityName ?? entityCode}
            </h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-500 dark:bg-white/10 dark:text-white/60">
              {entityCode}
            </span>
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

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
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
        )}
      </div>

      {saveMessage && !editing && successChanges == null && (
        <div
          role="status"
          className="rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-800 ring-1 ring-emerald-200 transition-all duration-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30"
        >
          {saveMessage}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-[22px] bg-white px-4 py-3 shadow-[0_16px_36px_-24px_rgba(112,144,176,0.25)] dark:bg-[var(--card)] dark:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.55)]">
        <label className="min-w-0 w-full text-sm text-slate-700 dark:text-white/80 sm:w-auto">
          <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
            {selectLabel}
          </span>
          <select
            className={cn(taInput, "w-full min-w-0 max-w-full font-mono text-sm sm:w-auto sm:min-w-[200px]")}
            value={selectValue}
            disabled={editing}
            onChange={(e) => onSelectChange(e.target.value)}
          >
            {(selectOptions.length ? selectOptions : [{ value: selectValue, label: entityCode }]).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {children}

      {relatedLinks && (
        <section className="rounded-[22px] bg-white p-6 shadow-[0_16px_36px_-24px_rgba(112,144,176,0.25)] dark:bg-[var(--card)] dark:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.55)]">
          <h3 className="mb-3 text-[14px] font-bold text-slate-800 dark:text-white">Related</h3>
          <div className="flex flex-wrap gap-2">{relatedLinks}</div>
        </section>
      )}

      <p className="pb-2 text-center text-[11px] text-slate-400 dark:text-white/40">{footer}</p>

      <DetailEditModal
        open={editing}
        title={`Edit ${entityLabel}`}
        lockedIdLabel={lockedIdLabel}
        lockedIdValue={entityCode}
        saving={saving}
        error={editError}
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
