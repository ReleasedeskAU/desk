"use client";

import { Suspense } from "react";
import { Sidebar } from "./Sidebar";
import { AppHeader } from "./AppHeader";
import { Backdrop } from "./Backdrop";
import { NavigationHistoryTrail } from "./NavigationHistoryTrail";
import { ChatProvider } from "@/components/chat/ChatProvider";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { VoiceMic } from "@/components/voice/VoiceMic";
import { PageDocumentationProvider } from "@/context/PageDocumentationContext";
import { NewUserWelcomeModal } from "@/components/help/HelpCenterModal";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { ReleaseStoreProvider } from "@/context/ReleaseStoreContext";
import { ReleaseFiltersProvider } from "@/context/ReleaseFiltersContext";
import { ColumnPreferencesProvider } from "@/context/ColumnPreferencesProvider";
import { NavigationHistoryProvider } from "@/context/NavigationHistoryContext";
import { cn } from "@/lib/utils";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { isMobileOpen } = useSidebar();

  return (
    <ChatProvider>
      <div className="relative min-h-screen materio-page-bg">
        <Sidebar />
        <Backdrop />
        <div
          className={cn(
            "relative z-0 flex min-h-screen min-w-0 flex-1 flex-col transition-[margin] duration-300 ease-in-out motion-reduce:transition-none",
            // Margin tracks visual sidebar width (pin OR hover expand) — never overlaps content
            isMobileOpen ? "ml-0" : "lg:ml-[var(--sidebar-width)]"
          )}
        >
          <AppHeader />
          <NavigationHistoryTrail />
          <main className="materio-main min-w-0 flex-1 px-4 pb-6 pt-6 md:px-6 lg:px-8">
            {children}
          </main>
          <ChatPanel />
          {/* Voice lives in the shell so navigate_to does not tear down the Live session. */}
          <VoiceMic />
          <NewUserWelcomeModal />
        </div>
      </div>
    </ChatProvider>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ReleaseStoreProvider>
        <Suspense fallback={null}>
          <ColumnPreferencesProvider>
            <PageDocumentationProvider>
              <ReleaseFiltersProvider>
                <NavigationHistoryProvider>
                  <ShellInner>{children}</ShellInner>
                </NavigationHistoryProvider>
              </ReleaseFiltersProvider>
            </PageDocumentationProvider>
          </ColumnPreferencesProvider>
        </Suspense>
      </ReleaseStoreProvider>
    </SidebarProvider>
  );
}
