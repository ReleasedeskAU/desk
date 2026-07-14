"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MagicCard } from "@/components/ui/magic-card";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ColumnDef } from "@/lib/table-column-types";
import type { SortDirection } from "@/lib/table-sort";

interface DataTableProps {
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Shared scrollport: visible scrollbars + edge-fade cues when more content is off-screen.
 * Used by DataTable by default. Pages with a custom card shell may opt in by wrapping
 * their <table> in this component (do not change DataTable defaults to force it).
 * table-standard.mdc #7–9, #12.
 */
export function DataTableScrollArea({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: false, top: false, bottom: false });

  const updateFade = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollLeft, scrollTop, scrollWidth, scrollHeight, clientWidth, clientHeight } = el;
    const eps = 2;
    setFade({
      left: scrollLeft > eps,
      right: scrollLeft + clientWidth < scrollWidth - eps,
      top: scrollTop > eps,
      bottom: scrollTop + clientHeight < scrollHeight - eps,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    updateFade();
    const ro = new ResizeObserver(updateFade);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    window.addEventListener("resize", updateFade);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateFade);
    };
  }, [updateFade, children]);

  return (
    <div
      className="data-table-scroll-shell"
      data-fade-left={fade.left ? "true" : "false"}
      data-fade-right={fade.right ? "true" : "false"}
      data-fade-top={fade.top ? "true" : "false"}
      data-fade-bottom={fade.bottom ? "true" : "false"}
    >
      <div className="data-table-fade-top" aria-hidden />
      <div className="data-table-fade-bottom" aria-hidden />
      <div
        ref={ref}
        onScroll={updateFade}
        className="data-table-body max-h-[calc(100dvh-var(--header-height)-14rem)]"
      >
        {children}
      </div>
    </div>
  );
}

export function DataTable({ title, subtitle, icon: Icon, action, toolbar, children, className }: DataTableProps) {
  const hasToolbarSection = Boolean(title || Icon || toolbar || action);

  return (
    <MagicCard
      gradient="from-gray-200/70 via-white to-gray-200/70"
      // min-w-0: grid/flex items default to min-width:auto and grow with wide tables,
      // which expands the page and pushes toolbar (Manage Columns / Sort) off-screen.
      className={cn("w-full min-w-0 max-w-full", className)}
      innerClassName="min-w-0"
    >
      {hasToolbarSection && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 bg-white px-4 py-4 dark:border-[var(--border)] dark:bg-[var(--card)] sm:items-center sm:px-6 sm:py-5">
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
            {Icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-100 bg-brand-50 shadow-sm dark:border-brand-500/20 dark:bg-brand-500/10">
                <Icon className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              </div>
            )}
            <div className="min-w-0">
              {title && <h3 className="truncate text-headline-sm font-bold text-gray-900 dark:text-white">{title}</h3>}
              {subtitle && (
                <p className="mt-0.5 truncate text-xs font-medium text-gray-500 dark:text-gray-400">{subtitle}</p>
              )}
            </div>
          </div>
          {(toolbar || action) && (
            <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
              {toolbar}
              {action}
            </div>
          )}
        </div>
      )}
      <DataTableScrollArea>{children}</DataTableScrollArea>
    </MagicCard>
  );
}

export const dataTableTableClass = "w-full min-w-max border-collapse text-sm";

export const tableHeadRow = "border-b border-gray-200 dark:border-[var(--border)]";

/** Sticky column headings at the top of the table scroll area (aligned with body columns). */
export const stickyHeadCell =
  "sticky top-0 z-20 bg-gray-50 shadow-[0_1px_0_0_rgb(229_231_235)] dark:bg-[var(--card)] dark:shadow-[0_1px_0_0_var(--border)]";

export const tableHeadCell = cn(
  stickyHeadCell,
  "border-x-0 border-t-0 px-3 py-3 min-w-[5.5rem] text-left align-middle text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 whitespace-nowrap"
);

/**
 * Canonical body row style (table-standard.mdc #10):
 * horizontal divider only — no vertical column borders; smooth hover transition.
 * Prefer this over ad-hoc divide-y / border-r row classes.
 */
export const tableRow =
  "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-200 group";
/** Body cell: bottom border only (row separators). Never left/right borders. */
export const tableCell =
  "border-x-0 border-t-0 border-b border-gray-200 px-4 py-3 align-middle transition-colors text-gray-800 dark:border-[var(--border)] dark:text-gray-200";

export function TableToolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-2", className)}>{children}</div>
  );
}

function SortIndicators({
  active,
  dir,
  onAsc,
  onDesc,
}: {
  active: boolean;
  dir: SortDirection;
  onAsc: () => void;
  onDesc: () => void;
}) {
  return (
    <span className="inline-flex shrink-0 flex-col items-center justify-center leading-none">
      <button
        type="button"
        title="Ascending"
        aria-label="Ascending"
        onClick={(e) => {
          e.stopPropagation();
          onAsc();
        }}
        className="rounded p-0.5 hover:bg-gray-200/80 dark:hover:bg-white/10"
      >
        <ChevronUp
          className={cn(
            "h-2.5 w-2.5 -mb-px",
            active && dir === "asc"
              ? "text-brand-600 dark:text-brand-400"
              : "text-gray-400 dark:text-gray-500"
          )}
        />
      </button>
      <button
        type="button"
        title="Descending"
        aria-label="Descending"
        onClick={(e) => {
          e.stopPropagation();
          onDesc();
        }}
        className="rounded p-0.5 hover:bg-gray-200/80 dark:hover:bg-white/10"
      >
        <ChevronDown
          className={cn(
            "h-2.5 w-2.5",
            active && dir === "desc"
              ? "text-brand-600 dark:text-brand-400"
              : "text-gray-400 dark:text-gray-500"
          )}
        />
      </button>
    </span>
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
  dir: SortDirection;
  onSort: (dir?: SortDirection) => void;
  className?: string;
}) {
  return (
    <th
      className={cn(tableHeadCell, className)}
      title={label}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <div className="inline-flex max-w-full items-center gap-1.5">
        <button
          type="button"
          onClick={() => onSort()}
          className="min-w-0 truncate hover:text-gray-900 dark:hover:text-white"
        >
          {label}
        </button>
        <SortIndicators
          active={active}
          dir={dir}
          onAsc={() => onSort("asc")}
          onDesc={() => onSort("desc")}
        />
      </div>
    </th>
  );
}

export function DataTableHeadRow({
  columns,
  isColumnVisible,
  sortKey,
  sortDir,
  onSort,
  sortableKeys,
  extraHeaders,
}: {
  columns: ColumnDef[];
  isColumnVisible: (key: string) => boolean;
  sortKey: string;
  sortDir: SortDirection;
  onSort: (key: string, dir?: SortDirection) => void;
  sortableKeys?: Set<string>;
  extraHeaders?: React.ReactNode;
}) {
  return (
    <tr className={cn(tableHeadRow, "group bg-gray-50 dark:bg-[var(--card)]")}>
      {columns
        .filter((c) => isColumnVisible(c.key))
        .map((col) => {
          const sortable = sortableKeys ? sortableKeys.has(col.key) : col.key !== "actions";
          if (!sortable) {
            return (
              <th key={col.key} className={tableHeadCell} title={col.label}>
                {col.label}
              </th>
            );
          }
          return (
            <SortableTh
              key={col.key}
              label={col.label}
              active={sortKey === col.key}
              dir={sortDir}
              onSort={(dir) => onSort(col.key, dir)}
            />
          );
        })}
      {extraHeaders}
    </tr>
  );
}
