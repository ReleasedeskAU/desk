"use client";

import { ChevronRight } from "lucide-react";
import { useNavigationHistory } from "@/context/NavigationHistoryContext";
import { cn } from "@/lib/utils";

export function NavigationHistoryTrail() {
  const { trail, goToCrumb } = useNavigationHistory();

  if (trail.length === 0) return null;

  return (
    <nav
      aria-label="Navigation history"
      className="border-b border-[var(--border)] bg-[var(--background)]/80 px-4 py-2 backdrop-blur-sm md:px-6 lg:px-8"
    >
      <ol className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto text-[12px] font-semibold leading-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={`${crumb.pathname}-${index}`} className="flex shrink-0 items-center gap-1">
              {index > 0 ? (
                <ChevronRight className="h-3 w-3 shrink-0 text-slate-300 dark:text-white/25" aria-hidden />
              ) : null}
              {isLast ? (
                <span
                  className="max-w-[10rem] truncate text-slate-700 dark:text-white/85"
                  aria-current="page"
                  title={crumb.label}
                >
                  {crumb.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => goToCrumb(index)}
                  className={cn(
                    "max-w-[10rem] truncate rounded px-1.5 py-1 text-slate-400 transition-colors",
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
