"use client";

import { usePageDocumentationTrigger } from "@/context/PageDocumentationContext";
import { getPageDocumentation, type PageDocKey } from "@/lib/page-documentation";
import { cn } from "@/lib/utils";

interface TopBarProps {
  title: string;
  /** Live count / scope line (e.g. "42 releases · Finance"). */
  subtitle?: string;
  /**
   * Page-purpose copy shown under the title.
   * Prefer `pageKey` so copy stays centralized in page-documentation.ts.
   */
  description?: string;
  /**
   * When set, pulls the shared summary and enables "Know more"
   * (opens the same PageDocumentation popup registered on this page).
   */
  pageKey?: PageDocKey;
  /** Show "Know more" — defaults to true when `pageKey` is set. */
  showKnowMore?: boolean;
  positioning?: string;
  highlight?: boolean;
  badge?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}

/**
 * Shared page header.
 *
 * Description responsive rules (applied once here for every table page):
 * - < md: hide body copy; keep only "Know more" (full text lives in PageDocumentation).
 * - md+: single truncated line + Know more — never a forced multi-line block that
 *   pushes title/trailing actions around.
 */
export function TopBar({
  title,
  subtitle,
  description,
  pageKey,
  showKnowMore,
  positioning,
  highlight = false,
  badge,
  trailing,
  className,
}: TopBarProps) {
  const { requestPageDocumentationOpen } = usePageDocumentationTrigger();
  const docSummary = pageKey ? getPageDocumentation(pageKey)?.summary : undefined;
  const resolvedDescription = description ?? docSummary;
  const knowMore = showKnowMore ?? Boolean(pageKey);

  return (
    <header className={cn("relative mb-4 md:mb-5", className)}>
      <div className="relative flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1
            className={cn(
              "text-xl font-bold tracking-tight text-gray-900 sm:text-2xl dark:text-white",
              highlight && "text-brand-700 dark:text-brand-300",
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">{subtitle}</p>
          )}

          {(resolvedDescription || knowMore) && (
            <div className="mt-1.5 flex max-w-3xl min-w-0 items-baseline gap-x-1.5 text-sm leading-snug text-gray-600 dark:text-white/65">
              {resolvedDescription && (
                <p className="hidden min-w-0 truncate md:block" title={resolvedDescription}>
                  {resolvedDescription}
                </p>
              )}
              {knowMore && (
                <button
                  type="button"
                  onClick={requestPageDocumentationOpen}
                  className="shrink-0 font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
                >
                  Know more
                </button>
              )}
            </div>
          )}

          {positioning && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{positioning}</p>
          )}
        </div>
        <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2 pt-0.5">
          {trailing}
          {badge}
        </div>
      </div>
    </header>
  );
}
