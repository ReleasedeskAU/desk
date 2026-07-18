"use client";

import type { ReactNode } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { useNavHistoryLabel } from "@/context/NavigationHistoryContext";
import type { PageDocKey } from "@/lib/page-documentation";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { HoverExplain } from "@/components/ui/InfoTooltip";
import { ArrowLeft } from "lucide-react";

/**
 * Label + value pair for detail grids. Optional `hint` adds hover/tap explanation
 * (dotted underline on the label) so users do not have to guess field meaning.
 *
 * @param props - Label, value, and optional plain-English hint.
 * @returns Definition-list field.
 */
export function DetailField({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  /** Hover/tap explanation for non-technical users. */
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-gray-400 dark:text-white/45">
        {hint ? (
          <HoverExplain text={hint} label={`About ${label}`}>
            <span className="cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2 dark:decoration-white/30">
              {label}
            </span>
          </HoverExplain>
        ) : (
          label
        )}
      </dt>
      <dd className="break-words font-medium text-gray-800 dark:text-white">{value ?? "—"}</dd>
    </div>
  );
}

export function DetailFieldGrid({
  children,
  cols = 2,
}: {
  children: ReactNode;
  cols?: 2 | 3;
}) {
  return (
    <dl
      className={
        cols === 3
          ? "grid gap-x-4 gap-y-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3"
          : "grid gap-x-4 gap-y-2.5 text-sm sm:grid-cols-2"
      }
    >
      {children}
    </dl>
  );
}

type DetailPageShellProps = {
  /** Shown in the navigation history trail */
  entityCode: string;
  title: string;
  subtitle?: string;
  /** Extra classes for the page title (e.g. larger release name). */
  titleClassName?: string;
  backHref?: string;
  backLabel?: string;
  /** Hide the back link row (e.g. release detail command center). */
  hideBack?: boolean;
  /** Center slot on the title row (e.g. Select Release dropdown). */
  headerCenter?: ReactNode;
  pageKey?: PageDocKey;
  badges?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

/** Shared chrome for entity detail pages (header, badges, actions, optional back link). */
export function DetailPageShell({
  entityCode,
  title,
  subtitle,
  titleClassName,
  backHref,
  backLabel,
  hideBack = false,
  headerCenter,
  pageKey,
  badges,
  actions,
  children,
}: DetailPageShellProps) {
  useNavHistoryLabel(entityCode);

  const showBack = !hideBack && Boolean(backHref && backLabel);

  return (
    <div className="space-y-4">
      <TopBar
        title={title}
        subtitle={subtitle}
        titleClassName={titleClassName}
        highlight
        pageKey={pageKey}
        center={headerCenter}
        trailing={
          <>
            {pageKey ? <PageDocumentation pageKey={pageKey} /> : null}
            {actions}
          </>
        }
      />

      {showBack || badges ? (
        <div className="flex flex-wrap items-center gap-3">
          {showBack ? (
            <ProgressLink
              href={backHref!}
              className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline dark:text-brand-400"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </ProgressLink>
          ) : null}
          {badges}
        </div>
      ) : null}

      {children}
    </div>
  );
}
