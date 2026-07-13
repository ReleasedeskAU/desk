"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Loader2, MoreVertical, Plus, X } from "lucide-react";
import { DataTableScrollArea } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { cn } from "@/lib/utils";

export const thClass =
  "sticky top-0 z-20 border-x-0 border-t-0 border-b border-gray-200 bg-gray-50 px-6 py-4 text-[12px] font-bold uppercase tracking-wider text-gray-500 dark:border-[var(--border)] dark:bg-[var(--card)]";
export const tdClass =
  "border-x-0 border-t-0 border-b border-gray-200 px-6 py-4 text-[14px] text-gray-800 dark:border-[var(--border)]";

export function MasterDataSectionHeader({
  title,
  subtitle,
  addLabel,
  onAdd,
}: {
  title: string;
  subtitle: string;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-[20px] font-bold text-gray-900">{title}</h2>
        <p className="text-[14px] text-gray-500 mt-1">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-2 rounded-lg bg-[#2548C9] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#1E3A9F] transition-colors"
      >
        <Plus className="h-4 w-4" /> {addLabel}
      </button>
    </div>
  );
}

/**
 * Master-data table card.
 * Opt into `scrollShell` for table-standard sticky header / first-col / edge-fade
 * (DataTableScrollArea). Default remains legacy overflow-x-auto so callers must opt in.
 */
export function MasterDataTableShell({
  children,
  toolbar,
  scrollShell = false,
}: {
  children: ReactNode;
  toolbar?: ReactNode;
  /** When true, use shared DataTable scrollport (sticky + edge-fade). Opt-in only. */
  scrollShell?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-[var(--border)] dark:bg-[var(--card)]">
      {toolbar && (
        <div className="flex items-center justify-end border-b border-gray-100 bg-gray-50/80 px-4 py-2 dark:border-[var(--border)] dark:bg-white/[0.03]">
          {toolbar}
        </div>
      )}
      {scrollShell ? (
        <DataTableScrollArea>{children}</DataTableScrollArea>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
    </div>
  );
}

export function MasterDataEmptyState({
  entityLabel,
  onAdd,
  addLabel,
}: {
  entityLabel: string;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <p className="text-[15px] text-gray-600 font-medium mb-4">
        No {entityLabel} yet — add your first one
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-2 rounded-lg bg-[#2548C9] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#1E3A9F] transition-colors"
      >
        <Plus className="h-4 w-4" /> {addLabel}
      </button>
    </div>
  );
}

export function MasterDataLoading({ columns = 5 }: { columns?: number }) {
  return <TableSkeleton showFilterBar={false} showTitle={false} columns={columns} rows={6} />;
}

export function MasterDataError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700 mb-4 flex items-center justify-between gap-4">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline shrink-0">
          Retry
        </button>
      )}
    </div>
  );
}

export function RowActionsMenu({
  onEdit,
  onDelete,
  extraItems,
}: {
  onEdit: () => void;
  onDelete: () => void;
  extraItems?: { label: string; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        aria-label="Actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {extraItems?.map((item) => (
            <button
              key={item.label}
              type="button"
              className="w-full px-4 py-2 text-left text-[13px] text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className="w-full px-4 py-2 text-left text-[13px] text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="w-full px-4 py-2 text-left text-[13px] text-red-600 hover:bg-red-50"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function FormModal({
  open,
  title,
  onClose,
  onSubmit,
  submitting,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting?: boolean;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-[18px] font-bold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="px-6 py-5 space-y-4">
          {children}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-[14px] font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-[#2548C9] px-5 py-2 text-[14px] font-semibold text-white hover:bg-[#1E3A9F] disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function FormField({
  label,
  children,
  required,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-gray-700 mb-1.5 block">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-[14px] text-gray-900 focus:border-[#2548C9] focus:outline-none focus:ring-1 focus:ring-[#2548C9]";

export function StatusPill({ value }: { value: string }) {
  const lower = value.toLowerCase();
  return (
    <span
      className={cn(
        "px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border",
        lower === "active"
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : lower.includes("admin") || lower.includes("manager")
            ? "bg-purple-50 text-purple-700 border-purple-200"
            : "bg-blue-50 text-blue-700 border-blue-200"
      )}
    >
      {value}
    </span>
  );
}

export function ViewAllLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center text-[14px] font-semibold text-[#2548C9] hover:underline"
    >
      {label} →
    </a>
  );
}

export function BrowseToolbar({
  search,
  onSearchChange,
  page,
  totalPages,
  totalRows,
  pageSize,
  onPageChange,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  page: number;
  totalPages: number;
  totalRows: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const from = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalRows);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-gray-200 bg-gray-50/50">
      <input
        type="search"
        placeholder="Search…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full sm:w-72 rounded-lg border border-gray-200 px-3 py-2 text-[14px] focus:border-[#2548C9] focus:outline-none focus:ring-1 focus:ring-[#2548C9]"
      />
      <div className="flex items-center gap-3 text-[13px] text-gray-600">
        <span>
          {from}–{to} of {totalRows}
        </span>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40 hover:bg-white"
        >
          Prev
        </button>
        <span className="font-medium">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40 hover:bg-white"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function SortableTh({
  label,
  active,
  dir,
  onSort,
  className,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onSort: (dir?: "asc" | "desc") => void;
  className?: string;
}) {
  return (
    <th className={cn(thClass, "sticky top-0 z-20 bg-gray-50 dark:bg-[var(--card)]", className)}>
      <div className="inline-flex items-center gap-1.5">
        <button type="button" onClick={() => onSort()} className="hover:text-gray-800 dark:hover:text-white">
          {label}
        </button>
        <span className="inline-flex shrink-0 flex-col items-center justify-center leading-none">
          <button type="button" title="Ascending" aria-label="Ascending" onClick={() => onSort("asc")} className="rounded p-0.5 hover:bg-gray-200/80 dark:hover:bg-white/10">
            <ChevronUp className={cn("h-2.5 w-2.5 -mb-px", active && dir === "asc" ? "text-brand-600 dark:text-brand-400" : "text-gray-400 dark:text-gray-500")} />
          </button>
          <button type="button" title="Descending" aria-label="Descending" onClick={() => onSort("desc")} className="rounded p-0.5 hover:bg-gray-200/80 dark:hover:bg-white/10">
            <ChevronDown className={cn("h-2.5 w-2.5", active && dir === "desc" ? "text-brand-600 dark:text-brand-400" : "text-gray-400 dark:text-gray-500")} />
          </button>
        </span>
      </div>
    </th>
  );
}
