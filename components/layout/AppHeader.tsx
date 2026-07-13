"use client";

import { useEffect, useState } from "react";
import { SignOutButton, useUser } from "@clerk/nextjs";
import { useSidebar } from "@/context/SidebarContext";
import { Bell, CircleHelp, Menu, Search } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { NotificationPanel } from "@/components/layout/NotificationPanel";
import { usePageDocumentationTrigger } from "@/context/PageDocumentationContext";
import { ThemeModeToggle } from "@/components/materio/ThemeModeToggle";
import { useReleaseStore } from "@/context/ReleaseStoreContext";

export function AppHeader() {
  const { user, isLoaded } = useUser();
  const { isMobileOpen, toggleMobileSidebar } = useSidebar();
  const { unreadNotifications } = useReleaseStore();
  const { requestPageDocumentationOpen } = usePageDocumentationTrigger();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const [mounted, setMounted] = useState(false);

  const displayName =
    user?.fullName?.trim() ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "User";
  const displayEmail = user?.primaryEmailAddress?.emailAddress ?? "";

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="materio-header sticky top-0 z-30 w-full border-b border-[var(--border)]">
        <div className="flex h-[var(--header-height)] items-center justify-between gap-4 px-4 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={toggleMobileSidebar}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-gray-600 dark:text-white/80 transition-colors hover:bg-brand-50 dark:hover:bg-white/10 hover:text-brand-600 lg:hidden"
              aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-controls="app-sidebar"
              aria-expanded={isMobileOpen}
            >
              <Menu className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="relative hidden max-w-md flex-1 items-center text-left lg:flex transition-transform hover:scale-[1.01]"
            >
              <Search className="absolute left-3 h-4 w-4 text-brand-500" />
              <span className="flex h-10 w-full items-center rounded-lg border border-gray-200 dark:border-[var(--border)] bg-gray-50 dark:bg-[var(--card)] pl-10 pr-16 text-sm text-gray-600 dark:text-white/75 transition-colors hover:bg-gray-100 dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-[var(--border)]">
                Search releases, tickets, CRs...
              </span>
              <kbd className="absolute right-3 hidden rounded-md border border-gray-200 dark:border-[var(--border)] bg-white dark:bg-[var(--card)] px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-white/65 shadow-sm sm:inline">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 dark:border-[var(--border)] bg-white dark:bg-[var(--card)] text-gray-600 dark:text-white/80 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors lg:hidden"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>

            <ThemeModeToggle />

            <button
              type="button"
              onClick={requestPageDocumentationOpen}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 dark:border-[var(--border)] bg-white dark:bg-[var(--card)] text-gray-600 dark:text-white/80 hover:bg-gray-50 dark:hover:bg-white/10 hover:text-brand-600 transition-colors"
              aria-label="Open page documentation"
              title="Page help"
            >
              <CircleHelp className="h-5 w-5" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen((v) => !v)}
                className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 dark:border-[var(--border)] bg-white dark:bg-[var(--card)] text-gray-600 dark:text-white/80 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {mounted && unreadNotifications > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-error-500 text-[10px] font-bold text-white shadow-glow-brand animate-pulseDot">
                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
                  </span>
                )}
              </button>
              <NotificationPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
            </div>

            <div className="ml-2 flex items-center gap-3 border-l border-gray-300/50 dark:border-[var(--border)] pl-4">
              <div className="rounded-full ring-2 ring-gray-100 dark:ring-white/10 p-0.5">
                <Avatar name={isLoaded ? displayName : "…"} size="sm" />
              </div>
              <div className="hidden sm:block min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-[160px]">
                  {isLoaded ? displayName : "…"}
                </p>
                <p className="text-xs font-medium text-brand-600 dark:text-brand-400 truncate max-w-[160px]">
                  {isLoaded ? displayEmail : ""}
                </p>
              </div>
              {mounted && isLoaded ? (
                <SignOutButton>
                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 dark:border-[var(--border)] bg-white dark:bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-white/80 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
                  >
                    Sign out
                  </button>
                </SignOutButton>
              ) : (
                <button
                  type="button"
                  disabled
                  className="rounded-lg border border-gray-200 dark:border-[var(--border)] bg-white dark:bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-white/40"
                >
                  Sign out
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
