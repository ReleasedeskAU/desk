"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { resolveNavHistoryLabel } from "@/lib/nav-history-labels";

export type NavHistoryCrumb = {
  /** Full href including query string when present. */
  href: string;
  /** Pathname only — used for same-route / truncate logic. */
  pathname: string;
  label: string;
};

type NavigationHistoryContextValue = {
  trail: NavHistoryCrumb[];
  /** Navigate to crumb at index and drop everything after it. */
  goToCrumb: (index: number) => void;
  /**
   * Override the label for the current pathname (e.g. release code once loaded).
   * No-op if pathname does not match the current page.
   */
  setTrailLabel: (label: string) => void;
};

const NavigationHistoryContext = createContext<NavigationHistoryContextValue | null>(null);

function buildHref(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}

function preferLabel(existing: string, resolved: string): string {
  if (!existing || existing === "Release") return resolved;
  if (resolved === "Release") return existing;
  return existing;
}

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const router = useRouter();
  const [trail, setTrail] = useState<NavHistoryCrumb[]>([]);
  /** Pathname we truncated to — next matching route effect syncs href only. */
  const pendingTruncatePathRef = useRef<string | null>(null);

  useEffect(() => {
    const href = buildHref(pathname, search);
    const resolved = resolveNavHistoryLabel(pathname);

    if (pendingTruncatePathRef.current !== null) {
      if (pathname !== pendingTruncatePathRef.current) {
        // Truncate navigation still in flight — don't append yet
        return;
      }
      pendingTruncatePathRef.current = null;
      setTrail((prev) => {
        const idx = prev.findIndex((c) => c.pathname === pathname);
        if (idx >= 0) {
          const sliced = prev.slice(0, idx + 1);
          const last = sliced[idx]!;
          const label = preferLabel(last.label, resolved);
          if (last.href === href && last.label === label && sliced.length === prev.length) return prev;
          return [...sliced.slice(0, -1), { ...last, href, label }];
        }
        return [{ href, pathname, label: resolved }];
      });
      return;
    }

    setTrail((prev) => {
      if (prev.length === 0) {
        return [{ href, pathname, label: resolved }];
      }

      const last = prev[prev.length - 1]!;
      if (last.pathname === pathname) {
        const label = preferLabel(last.label, resolved);
        if (last.href === href && last.label === label) return prev;
        return [...prev.slice(0, -1), { href, pathname, label }];
      }

      return [...prev, { href, pathname, label: resolved }];
    });
  }, [pathname, search]);

  const goToCrumb = useCallback(
    (index: number) => {
      setTrail((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        const target = prev[index]!;
        pendingTruncatePathRef.current = target.pathname;
        queueMicrotask(() => {
          router.push(target.href);
        });
        // Safety: if navigation never reaches the target, don't block the trail forever
        window.setTimeout(() => {
          if (pendingTruncatePathRef.current === target.pathname) {
            pendingTruncatePathRef.current = null;
          }
        }, 3000);
        return prev.slice(0, index + 1);
      });
    },
    [router]
  );

  const setTrailLabel = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      setTrail((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1]!;
        if (last.pathname !== pathname) return prev;
        if (last.label === trimmed) return prev;
        return [...prev.slice(0, -1), { ...last, label: trimmed }];
      });
    },
    [pathname]
  );

  const value = useMemo(
    () => ({ trail, goToCrumb, setTrailLabel }),
    [trail, goToCrumb, setTrailLabel]
  );

  return (
    <NavigationHistoryContext.Provider value={value}>{children}</NavigationHistoryContext.Provider>
  );
}

export function useNavigationHistory(): NavigationHistoryContextValue {
  const ctx = useContext(NavigationHistoryContext);
  if (!ctx) {
    return {
      trail: [],
      goToCrumb: () => {},
      setTrailLabel: () => {},
    };
  }
  return ctx;
}

/** Register a better label for the current page (release codes, etc.). */
export function useNavHistoryLabel(label: string | null | undefined) {
  const { setTrailLabel } = useNavigationHistory();
  useEffect(() => {
    if (label) setTrailLabel(label);
  }, [label, setTrailLabel]);
}
