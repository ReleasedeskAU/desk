"use client";

import { useEffect, type ReactNode } from "react";
import { prefetchColumnPreferences } from "@/lib/column-preferences-cache";
import { TABLE_PAGE_KEYS } from "@/lib/table-page-columns";

/** Warm column-preference cache after first paint so Clerk UI can mount without network contention. */
export function ColumnPreferencesProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const run = () => prefetchColumnPreferences(TABLE_PAGE_KEYS);
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(run, { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const timer = globalThis.setTimeout(run, 1500);
    return () => globalThis.clearTimeout(timer);
  }, []);

  return children;
}
