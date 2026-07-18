"use client";

import { ProgressLink } from "@/components/layout/NavigationProgress";
import { StatusChip, type ChipTone } from "@/components/detail/editable";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  Calendar,
  CalendarCheck,
  ClipboardCheck,
  LayoutDashboard,
  List,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";

const STATUSES = ["Planned", "In Progress", "Blocked", "At Risk", "Complete"] as const;

function statusTone(status?: string | null): ChipTone {
  const normalized = (status ?? "").toLowerCase();
  if (normalized.includes("block")) return "bad";
  if (normalized.includes("risk") || normalized.includes("hold") || normalized.includes("progress")) return "warn";
  if (normalized.includes("complete") || normalized.includes("ready") || normalized.includes("approve")) return "good";
  if (normalized.includes("plan")) return "info";
  return "neutral";
}

export type ReleaseActionStripProps = {
  status: string;
  decision?: string | null;
  canEdit: boolean;
  onPatchStatus: (status: string) => void;
  onRecordDecision: (detail: string) => void;
};

/**
 * Full-width release controls strip — status, Go/No-Go, and shortcuts.
 * Sized as a primary command surface (not a slim footer bar).
 *
 * @param props - Current status/decision and action handlers.
 * @returns Prominent controls strip.
 */
export function ReleaseActionStrip({
  status,
  decision,
  canEdit,
  onPatchStatus,
  onRecordDecision,
}: ReleaseActionStripProps) {
  return (
    <div
      id="go-nogo"
      className="w-full scroll-mt-24 rounded-[22px] border border-slate-100/80 border-l-[4px] border-l-violet-500 bg-white px-5 py-5 shadow-[0_16px_36px_-24px_rgba(112,144,176,0.25)] dark:border-[var(--border)] dark:bg-[var(--card)] dark:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.55)] sm:px-6 sm:py-6"
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
          <SlidersHorizontal size={18} aria-hidden />
        </span>
        <div>
          <p className="text-[15px] font-bold text-slate-800 dark:text-white">Release controls</p>
          <p className="text-[12px] text-slate-400 dark:text-white/45">
            Update status, record Go / No-Go, and jump to related views
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Status
          </span>
          {canEdit ? (
            STATUSES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onPatchStatus(item)}
                className={cn(
                  "rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors",
                  status === item
                    ? "border-indigo-600 bg-indigo-600 text-white shadow-sm shadow-indigo-200 dark:shadow-indigo-900/40"
                    : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-[var(--border)] dark:bg-white/5 dark:text-white/65"
                )}
              >
                {item}
              </button>
            ))
          ) : (
            <StatusChip label={status} tone={statusTone(status)} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <StatusChip label={decision ?? "No decision"} tone={statusTone(decision)} />
          {canEdit && (
            <>
              <button
                type="button"
                className={cn(
                  taBtnPrimary,
                  "!bg-emerald-600 !px-5 !py-2.5 !text-[13px] !font-semibold hover:!bg-emerald-700"
                )}
                onClick={() => onRecordDecision("Go — approved for deployment")}
              >
                Record Go
              </button>
              <button
                type="button"
                className={cn(
                  taBtnPrimary,
                  "!bg-rose-600 !px-5 !py-2.5 !text-[13px] !font-semibold hover:!bg-rose-700"
                )}
                onClick={() => onRecordDecision("No-Go — blocked")}
              >
                Record No-Go
              </button>
            </>
          )}
          <span className="mx-1 hidden h-8 w-px bg-slate-200 sm:inline-block dark:bg-white/15" />
          <ProgressLink
            href="/calendar"
            className={cn(taBtnSecondary, "!px-3 !py-2.5")}
            title="Calendar"
          >
            <Calendar className="h-[18px] w-[18px]" />
          </ProgressLink>
          <ProgressLink
            href="/booking"
            className={cn(taBtnSecondary, "!px-3 !py-2.5")}
            title="Env Booking"
          >
            <CalendarCheck className="h-[18px] w-[18px]" />
          </ProgressLink>
          <ProgressLink
            href="/approvals"
            className={cn(taBtnSecondary, "!px-3 !py-2.5")}
            title="Approvals"
          >
            <ClipboardCheck className="h-[18px] w-[18px]" />
          </ProgressLink>
          <ProgressLink
            href="/risks"
            className={cn(taBtnSecondary, "!px-3 !py-2.5")}
            title="Risks"
          >
            <ShieldAlert className="h-[18px] w-[18px]" />
          </ProgressLink>
          <ProgressLink
            href="/dashboard"
            className={cn(taBtnSecondary, "!px-3 !py-2.5")}
            title="Dashboard"
          >
            <LayoutDashboard className="h-[18px] w-[18px]" />
          </ProgressLink>
          <ProgressLink
            href="/releases"
            className={cn(taBtnSecondary, "!px-3 !py-2.5")}
            title="All Releases"
          >
            <List className="h-[18px] w-[18px]" />
          </ProgressLink>
        </div>
      </div>
    </div>
  );
}
