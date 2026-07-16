"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavigationProgressContextValue = {
  start: () => void;
};

const NavigationProgressContext = createContext<NavigationProgressContextValue>({
  start: () => {},
});

export function useNavigationProgress() {
  return useContext(NavigationProgressContext);
}

function hrefPath(href: ComponentProps<typeof Link>["href"]): string {
  if (typeof href === "string") return href.split("?")[0];
  return href.pathname ?? "";
}

/**
 * Button / nav chrome should not get hyperlink underline styling.
 * @param className - Classes passed to ProgressLink.
 * @returns True when the link should render as a text hyperlink.
 */
function isTextHyperlink(className?: string): boolean {
  if (!className) return true;
  if (/\bno-underline\b|\brd-chrome\b|\bmenu-item/.test(className)) return false;
  // taBtnPrimary / taBtnSecondary (and similar chips)
  if (/shadow-theme-sm/.test(className) && /rounded-lg|rounded-xl/.test(className)) return false;
  if (/justify-center/.test(className) && /border|bg-brand-500|bg-white/.test(className)) return false;
  // Layout wrappers (sidebar logo, icon rows) without text-link cues
  const looksLikeTextLink =
    /text-brand|hover:underline|\bunderline\b|font-mono|font-medium text-|font-semibold text-|font-bold text-|font-black text-/.test(
      className
    );
  if (!looksLikeTextLink && /(?:^|\s)flex(?:\s|$)/.test(className)) return false;
  return true;
}

export function NavigationProgressProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const navigatingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearProgressInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    navigatingRef.current = true;
    clearProgressInterval();
    setVisible(true);
    setWidth(10);
    intervalRef.current = setInterval(() => {
      setWidth((w) => (w >= 88 ? w : w + Math.random() * 6 + 2));
    }, 350);
  }, [clearProgressInterval]);

  const complete = useCallback(() => {
    clearProgressInterval();
    navigatingRef.current = false;
    setWidth(100);
    window.setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 280);
  }, [clearProgressInterval]);

  useEffect(() => {
    if (navigatingRef.current) complete();
  }, [pathname, complete]);

  useEffect(() => () => clearProgressInterval(), [clearProgressInterval]);

  return (
    <NavigationProgressContext.Provider value={{ start }}>
      <div
        className="fixed top-0 left-0 right-0 z-[9999] h-1 pointer-events-none"
        role="progressbar"
        aria-hidden={!visible}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width)}
      >
        <div
          className="h-full bg-brand-500 shadow-[0_0_10px_rgba(70,95,255,0.45)] transition-[width,opacity] duration-300 ease-out"
          style={{ width: `${width}%`, opacity: visible ? 1 : 0 }}
        />
      </div>
      {children}
    </NavigationProgressContext.Provider>
  );
}

type ProgressLinkProps = ComponentProps<typeof Link>;

/**
 * Next.js Link that starts the top navigation progress bar.
 * Text links get `.rd-link` so they stay recognizable under every color theme.
 */
export function ProgressLink({ href, onClick, className, ...props }: ProgressLinkProps) {
  const pathname = usePathname();
  const { start } = useNavigationProgress();

  return (
    <Link
      href={href}
      className={cn(isTextHyperlink(className) && "rd-link", className)}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        const target = hrefPath(href);
        if (target === pathname) return;
        start();
      }}
      {...props}
    />
  );
}
