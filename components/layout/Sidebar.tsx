"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import {
  SIDEBAR_HOVER_LEAVE_DELAY_MS,
  useSidebar,
} from "@/context/SidebarContext";
import { useHoverCapable } from "@/hooks/useHoverCapable";
import { ChevronsLeft, ChevronsRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SentinelLogo } from "@/components/brand/SentinelLogo";
import { QUICK_START_TEMPLATES } from "@/lib/quick-start-templates";
import { NAV_SECTIONS } from "@/lib/navigation";

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sidebar() {
  const pathname = usePathname();
  const {
    isExpanded,
    isMobileOpen,
    isHovered,
    hoverPeekLocked,
    isWide,
    toggleSidebar,
    toggleMobileSidebar,
    closeMobileSidebar,
    setIsHovered,
    collapsePeekAfterNavigation,
    unlockHoverPeek,
  } = useSidebar();
  const hoverCapable = useHoverCapable();

  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asideRef = useRef<HTMLElement>(null);

  const clearLeaveTimer = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };

  useEffect(() => () => clearLeaveTimer(), []);

  // Auto-collapse peek on every navigation (pinned-open is left alone).
  // Locks hover until mouseleave so a stationary cursor can't keep peek open.
  useEffect(() => {
    clearLeaveTimer();
    collapsePeekAfterNavigation();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to route changes
  }, [pathname]);

  // Mobile drawer: body scroll lock, Escape, basic focus trap.
  useEffect(() => {
    if (!isMobileOpen) return;
    const aside = asideRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      aside
        ? Array.from(aside.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => !el.hasAttribute("disabled") && el.offsetParent !== null
          )
        : [];

    const first = focusables()[0];
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMobileSidebar();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isMobileOpen, closeMobileSidebar]);

  const handleNavClick = () => {
    clearLeaveTimer();
    collapsePeekAfterNavigation();
  };

  const handleToggle = () => {
    clearLeaveTimer();
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      toggleSidebar();
    } else {
      toggleMobileSidebar();
    }
  };

  /**
   * Hover-to-expand only when:
   * - docked (not pinned), desktop width, not locked after nav
   * - device supports fine-pointer hover (no sticky-hover on touch)
   */
  const canHoverPeek =
    hoverCapable && !isExpanded && !isMobileOpen && !hoverPeekLocked;

  const onMouseEnter = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) return;
    if (!canHoverPeek) return;
    clearLeaveTimer();
    setIsHovered(true);
  };

  const onMouseLeave = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) return;
    clearLeaveTimer();
    // Unlock so the next enter can peek again (required after nav lock).
    unlockHoverPeek();
    if (isExpanded) return;
    leaveTimer.current = setTimeout(() => {
      setIsHovered(false);
      leaveTimer.current = null;
    }, SIDEBAR_HOVER_LEAVE_DELAY_MS);
  };

  const isPeeking = isHovered && !hoverPeekLocked && !isExpanded;

  return (
    <aside
      ref={asideRef}
      id="app-sidebar"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        "materio-sidebar fixed top-0 left-0 z-[100] flex h-screen flex-col border-r border-[var(--border)] bg-white shadow-sm transition-[width,transform] duration-300 ease-in-out lg:top-0 lg:left-0 lg:h-screen lg:rounded-none dark:bg-[#212738]",
        "motion-reduce:transition-none",
        isWide ? "w-[var(--sidebar-width-expanded)]" : "w-[var(--sidebar-width-collapsed)]",
        isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}
      data-sidebar-peek={isPeeking ? "true" : "false"}
      data-sidebar-wide={isWide ? "true" : "false"}
      aria-label="Main navigation"
      {...(isMobileOpen
        ? {
            role: "dialog" as const,
            "aria-modal": true as const,
          }
        : {})}
    >
      <div
        className={cn(
          "relative flex shrink-0 items-center border-b border-[var(--border)] px-3 py-3",
          isWide ? "justify-center" : "flex-col gap-3 lg:px-3"
        )}
      >
        <ProgressLink
          href="/dashboard"
          className={cn("flex min-w-0 items-center", !isWide && "lg:justify-center")}
          onClick={handleNavClick}
          aria-label="Release Desk home"
        >
          <SentinelLogo
            variant="icon"
            className={cn(isWide && "h-12 w-12 rounded-md")}
            priority
          />
        </ProgressLink>

        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            "materio-sidebar-toggle flex shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-gray-500 dark:text-white/70 transition-all hover:bg-brand-50 dark:hover:bg-white/10 hover:text-brand-600 shadow-sm",
            "h-8 w-8",
            isWide && "absolute right-3"
          )}
          aria-label={
            isMobileOpen
              ? "Close navigation menu"
              : isExpanded
                ? "Unpin sidebar (auto-collapse on)"
                : "Pin sidebar open"
          }
          title={
            isMobileOpen
              ? "Close menu"
              : isExpanded
                ? "Unpin — sidebar will auto-collapse"
                : "Pin sidebar open"
          }
        >
          {isExpanded || isMobileOpen ? (
            <ChevronsLeft className="h-4 w-4" />
          ) : (
            <ChevronsRight className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 no-scrollbar" aria-label="Primary">
        {NAV_SECTIONS.map((section, sectionIndex) => (
          <div key={section.title ?? `section-${sectionIndex}`} className={sectionIndex > 0 ? "mt-6" : ""}>
            {(section.title || sectionIndex === 0) && (
              <p
                className={cn(
                  "menu-section-label mb-2 px-2",
                  !isWide && "lg:mx-auto lg:w-6 lg:overflow-hidden lg:px-0 lg:text-center lg:text-[0px]"
                )}
                aria-hidden={!isWide}
              >
                {section.title ?? "Menu"}
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {section.items.map(({ href, label, icon: Icon, pulse }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <li key={href}>
                    <ProgressLink
                      href={href}
                      title={!isWide ? label : undefined}
                      onClick={handleNavClick}
                      className={cn(
                        "menu-item group",
                        active ? "menu-item-active" : "menu-item-inactive",
                        !isWide && "lg:justify-center lg:px-0"
                      )}
                    >
                      <span className={active ? "menu-item-icon-active" : "menu-item-icon-inactive"}>
                        <Icon className="h-[22px] w-[22px] shrink-0" />
                      </span>
                      {isWide && <span className="flex-1 truncate">{label}</span>}
                      {isWide && pulse && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-ai animate-pulseDot" />
                      )}
                      {!isWide && (
                        <span className="menu-item-tooltip lg:group-hover:opacity-100 lg:group-focus-visible:opacity-100">
                          {label}
                        </span>
                      )}
                    </ProgressLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {isWide && (
        <div className="shrink-0 border-t border-[var(--border)] px-3 py-4">
          <ProgressLink
            href="/templates"
            onClick={handleNavClick}
            className="block rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 shadow-sm transition-all hover:border-brand-400 dark:hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-white/10"
          >
            <p className="flex items-center gap-2 text-sm font-bold text-brand-700 dark:text-brand-300">
              <Sparkles className="h-4 w-4 text-brand-500 dark:text-brand-400" />
              Templates
            </p>
            <p className="mt-1 text-xs text-gray-600 dark:text-white/70 font-medium">
              {QUICK_START_TEMPLATES.length} guided demo scenarios
            </p>
          </ProgressLink>
        </div>
      )}
    </aside>
  );
}
