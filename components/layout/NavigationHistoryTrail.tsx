"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useNavigationHistory } from "@/context/NavigationHistoryContext";
import { cn } from "@/lib/utils";

const MAX_VISIBLE = 5;

export function NavigationHistoryTrail() {
  const { trail, goToCrumb } = useNavigationHistory();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (trail.length <= MAX_VISIBLE) setExpanded(false);
  }, [trail.length]);

  if (trail.length === 0) return null;

  const hiddenCount = trail.length > MAX_VISIBLE ? trail.length - MAX_VISIBLE : 0;
  const showCollapse = hiddenCount > 0 && !expanded;
  const visible = showCollapse ? trail.slice(-MAX_VISIBLE) : trail;
  const visibleStartIndex = showCollapse ? trail.length - MAX_VISIBLE : 0;

  return (
    <nav
      aria-label="Navigation history"
      className="border-b border-[var(--border)] bg-[var(--background)]/80 px-4 py-2 backdrop-blur-sm md:px-6 lg:px-8"
    >
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-[12px] font-semibold leading-none">
        {showCollapse && (
          <li className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="rounded px-1.5 py-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-white/80"
              aria-label={`Show ${hiddenCount} earlier pages`}
              title="Show earlier pages"
            >
              …
            </button>
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-300 dark:text-white/25" aria-hidden />
          </li>
        )}
        {visible.map((crumb, i) => {
          const index = visibleStartIndex + i;
          const isLast = index === trail.length - 1;
          return (
            <li key={`${crumb.pathname}-${index}`} className="flex min-w-0 items-center gap-1">
              {i > 0 ? (
                <ChevronRight className="h-3 w-3 shrink-0 text-slate-300 dark:text-white/25" aria-hidden />
              ) : null}
              {isLast ? (
                <span
                  className="truncate text-slate-700 dark:text-white/85"
                  aria-current="page"
                  title={crumb.label}
                >
                  {crumb.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(false);
                    goToCrumb(index);
                  }}
                  className={cn(
                    "truncate rounded px-1.5 py-1 text-slate-400 transition-colors",
                    "hover:bg-slate-100 hover:text-brand-600",
                    "dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-brand-300"
                  )}
                  title={crumb.label}
                >
                  {crumb.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
