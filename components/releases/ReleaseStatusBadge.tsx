"use client";

/**
 * Release status badge styled from lifecycle config (kind → tone).
 */
import type { ReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import {
  releaseStatusBadgeTokens,
  resolveReleaseStatusDisplay,
  type ReleaseStatusDisplay,
} from "@/lib/release-lifecycle-status-ui";
import { cn } from "@/lib/utils";

export type ReleaseStatusBadgeProps = {
  status: string;
  /** When provided, tone/label come from lifecycle SSOT. */
  config?: ReleaseLifecycleConfig | null;
  /** Pre-resolved display (avoids re-lookup in lists). */
  display?: ReleaseStatusDisplay | null;
  className?: string;
  showOffHint?: boolean;
};

/**
 * Render a release status pill using lifecycle kind tones when config is known.
 */
export function ReleaseStatusBadge({
  status,
  config,
  display: displayProp,
  className,
  showOffHint = true,
}: ReleaseStatusBadgeProps) {
  const display =
    displayProp ??
    (config
      ? resolveReleaseStatusDisplay(config, status)
      : {
          label: status || "—",
          kind: null,
          enabled: true,
          known: false,
          tone: "neutral" as const,
        });
  const token = releaseStatusBadgeTokens(display.tone);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-theme-xs font-medium",
        token.bg,
        token.text,
        className
      )}
      data-testid="release-status-badge"
    >
      {display.label}
      {showOffHint && display.known && !display.enabled ? (
        <span className="rounded bg-rose-100 px-1 text-[10px] font-semibold uppercase text-rose-700 dark:bg-rose-500/20 dark:text-rose-200">
          Off
        </span>
      ) : null}
    </span>
  );
}
