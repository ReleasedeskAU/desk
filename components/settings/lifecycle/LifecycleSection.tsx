"use client";

/**
 * Shared Active / Inactive section chrome for lifecycle settings lists.
 */
import type { ReactNode } from "react";

type LifecycleSectionProps = {
  title: string;
  count: number;
  children: ReactNode;
  /** Optional empty-state copy when count is 0. */
  emptyMessage?: string;
  testId?: string;
};

/**
 * Bordered list section with a count header.
 */
export function LifecycleSection({
  title,
  count,
  children,
  emptyMessage,
  testId,
}: LifecycleSectionProps) {
  return (
    <div
      className="rounded-xl border border-slate-200 dark:border-[var(--border)]"
      data-testid={testId}
    >
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/50">
        {title}{" "}
        <span className="font-semibold normal-case tracking-normal text-slate-400 dark:text-white/40">
          ({count})
        </span>
      </div>
      {count === 0 && emptyMessage ? (
        <p className="px-4 py-6 text-center text-[13px] text-slate-500 dark:text-white/45">
          {emptyMessage}
        </p>
      ) : (
        children
      )}
    </div>
  );
}
