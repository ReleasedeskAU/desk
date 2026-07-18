"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type CrmStatCardProps = {
  title: string;
  value: string | number;
  trendText?: string;
  trendDirection?: "up" | "down" | "neutral";
  icon: LucideIcon;
  color?: "primary" | "success" | "warning" | "error" | "info" | "neutral";
  /** Optional help control rendered next to the title (keeps the metric icon free). */
  help?: ReactNode;
};

const BORDER_MAP = {
  primary: "border-l-brand-600",
  success: "border-l-emerald-600",
  warning: "border-l-amber-700",
  error: "border-l-error-700",
  info: "border-l-blue-700",
  neutral: "border-l-gray-900",
};

const ICON_COLOR_MAP = {
  primary: "text-brand-600 dark:text-brand-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-700 dark:text-amber-400",
  error: "text-error-700 dark:text-error-400",
  info: "text-blue-700 dark:text-blue-400",
  neutral: "text-gray-900 dark:text-white",
};

/**
 * Compact executive KPI card used on /executive and release detail headline tiles.
 *
 * @param props - Title, value, optional trend line, metric icon, and optional help control.
 * @returns Styled KPI card.
 */
export function CrmStatCard({
  title,
  value,
  trendText,
  trendDirection = "neutral",
  icon: Icon,
  color = "primary",
  help,
}: CrmStatCardProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[140px] flex-col justify-between rounded-xl border border-l-[4px] border-gray-200 bg-white p-5 shadow-sm transition-shadow duration-150 hover:shadow-md dark:border-[var(--border)] dark:bg-[var(--card)]",
        BORDER_MAP[color] || BORDER_MAP.primary
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-white/65">
            {title}
          </span>
          {help}
        </div>
        <Icon
          className={cn("h-[18px] w-[18px] shrink-0", ICON_COLOR_MAP[color] || ICON_COLOR_MAP.primary)}
          strokeWidth={2}
          aria-hidden
        />
      </div>

      <div className="mt-4">
        <h4 className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">{value}</h4>

        {trendText && (
          <div
            className={cn(
              "mt-2.5 flex items-center gap-1.5 text-[11px] font-bold tracking-wide",
              trendDirection === "up"
                ? color === "warning"
                  ? "text-error-600"
                  : "text-emerald-600"
                : trendDirection === "down"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-gray-500 dark:text-white/65"
            )}
          >
            {trendDirection === "up" && <TrendingUp className="h-3.5 w-3.5" strokeWidth={3} />}
            {trendDirection === "down" && <TrendingDown className="h-3.5 w-3.5" strokeWidth={3} />}
            {trendDirection === "neutral" && <Minus className="h-3.5 w-3.5" strokeWidth={3} />}
            <span>{trendText}</span>
          </div>
        )}
      </div>
    </div>
  );
}
