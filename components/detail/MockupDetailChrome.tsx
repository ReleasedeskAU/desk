"use client";

import type { ReactNode } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { DetailField, DetailFieldGrid } from "@/components/detail/DetailPageShell";
import { taBtnSecondary, taInput } from "@/lib/styles";
import { formatDateTime, cn } from "@/lib/utils";
import { useNavHistoryLabel } from "@/context/NavigationHistoryContext";

export { DetailField, DetailFieldGrid };

/** Section card with mockup-style emoji heading. */
export function MockupSection({
  title,
  children,
  action,
  id,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div id={id}>
      <AdvancedCard title={title} action={action} variant="glass">
        {children}
      </AdvancedCard>
    </div>
  );
}

export type MockupSelectOption = { value: string; label: string };

export type MockupQuickAction = {
  href: string;
  label: string;
  icon?: ReactNode;
};

type MockupDetailChromeProps = {
  /** e.g. "⚠️ CONFLICT DETAIL PAGE" */
  pageTitle: string;
  /** History trail label */
  entityCode: string;
  selectLabel: string;
  selectValue: string;
  selectOptions: MockupSelectOption[];
  onSelectChange: (value: string) => void;
  lastRefresh: Date;
  footer: string;
  quickActions: MockupQuickAction[];
  headerActions?: ReactNode;
  children: ReactNode;
};

/**
 * Shared chrome for Excel red-tab detail pages:
 * title → Select + Last Refresh → sections → Quick Actions → footer.
 */
export function MockupDetailChrome({
  pageTitle,
  entityCode,
  selectLabel,
  selectValue,
  selectOptions,
  onSelectChange,
  lastRefresh,
  footer,
  quickActions,
  headerActions,
  children,
}: MockupDetailChromeProps) {
  useNavHistoryLabel(entityCode);

  return (
    <div className="space-y-5">
      <TopBar title={pageTitle} highlight />

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-gray-200/80 bg-gradient-to-r from-white via-brand-50/40 to-white px-4 py-3 shadow-sm dark:border-[var(--border)] dark:from-[var(--card)] dark:via-brand-500/5 dark:to-[var(--card)]">
        <label className="text-sm text-gray-700 dark:text-white/80">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-white/45">
            {selectLabel}
          </span>
          <select
            className={cn(taInput, "min-w-[240px] font-mono text-sm")}
            value={selectValue}
            onChange={(e) => onSelectChange(e.target.value)}
          >
            {selectOptions.length === 0 ? (
              <option value={selectValue}>{selectValue}</option>
            ) : (
              selectOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
            )}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          {headerActions}
          <p className="text-xs text-gray-500 dark:text-white/55">
            Last Refresh:{" "}
            <span className="font-medium text-gray-700 dark:text-white/80">
              {formatDateTime(lastRefresh.toISOString())}
            </span>
          </p>
        </div>
      </div>

      {children}

      <MockupSection title="⚡ Quick Actions">
        <div className="flex flex-wrap gap-2">
          {quickActions.map((a) => (
            <ProgressLink key={a.label} href={a.href} className={taBtnSecondary + " text-sm !py-2"}>
              {a.icon}
              {a.label}
            </ProgressLink>
          ))}
        </div>
      </MockupSection>

      <p className="pb-2 text-center text-xs text-gray-400 dark:text-white/40">{footer}</p>
    </div>
  );
}

/** Compact status strip for "AT A GLANCE" rows. */
export function GlanceStrip({
  items,
}: {
  items: { label: string; value: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }[];
}) {
  const toneClass = {
    neutral: "bg-gray-50 dark:bg-white/5",
    good: "bg-emerald-50 dark:bg-emerald-500/10",
    warn: "bg-amber-50 dark:bg-amber-500/10",
    bad: "bg-rose-50 dark:bg-rose-500/10",
  } as const;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "rounded-lg border border-gray-100 px-3 py-2.5 dark:border-[var(--border)]",
            toneClass[item.tone ?? "neutral"]
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/45">
            {item.label}
          </p>
          <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function dash(v: ReactNode) {
  if (v === null || v === undefined || v === "") return "—";
  return v;
}
