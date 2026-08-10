"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { TablePageSuspenseFallback } from "@/components/ui/TableSkeleton";
import { useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Users,
  Bell,
  Shield,
  Plug,
  Settings as SettingsIcon,
  Building2,
  Package,
  Server,
  UserCircle,
  Palette,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { RiskEngineSettings } from "@/components/settings/RiskEngineSettings";
import { TeamMembersTab } from "@/components/settings/TeamMembersTab";
import { DepartmentsTab } from "@/components/settings/master-data/DepartmentsTab";
import { ApplicationsTab } from "@/components/settings/master-data/ApplicationsTab";
import { EnvironmentsTab } from "@/components/settings/master-data/EnvironmentsTab";
import { UsersTab } from "@/components/settings/master-data/UsersTab";
import { VoiceUsagePanel } from "@/components/settings/VoiceUsagePanel";
import { SETTINGS_TAB_IDS, SETTINGS_TABS } from "@/lib/settings-tabs";

const SETTINGS_TAB_ICONS: Readonly<Record<string, LucideIcon>> = {
  general: SettingsIcon,
  appearance: Palette,
  "risk-engine": Gauge,
  team: Users,
  departments: Building2,
  applications: Package,
  environments: Server,
  users: UserCircle,
  notifications: Bell,
  integrations: Plug,
  security: Shield,
};

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  // Release Lifecycle moved to the dedicated Lifecycle sidebar page.
  useEffect(() => {
    if (tabParam === "release-lifecycle") {
      router.replace("/lifecycle");
    }
  }, [tabParam, router]);

  const initialTab =
    tabParam && SETTINGS_TAB_IDS.has(tabParam) ? tabParam : "team";
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (tabParam && SETTINGS_TAB_IDS.has(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam, activeTab]);

  const setTab = (id: string) => {
    setActiveTab(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id === "team") {
      params.delete("tab");
    } else {
      params.set("tab", id);
    }
    const qs = params.toString();
    router.replace(qs ? `/settings?${qs}` : "/settings", { scroll: false });
  };

  const sidebarNav = useMemo(
    () =>
      SETTINGS_TABS.map((tab) => ({
        ...tab,
        icon: SETTINGS_TAB_ICONS[tab.id] ?? SettingsIcon,
      })),
    []
  );

  const masterDataTabs = new Set([
    "departments",
    "applications",
    "environments",
    "users",
  ]);

  return (
    <div className="w-full pb-24 font-sans">
      <div className="mb-10 mt-2">
        <h1 className="mb-2 text-[32px] font-bold tracking-tight text-gray-900 dark:text-white">
          Settings
        </h1>
        <p className="text-[15px] font-medium leading-relaxed text-gray-500 dark:text-gray-300">
          Manage your account settings, team configuration, and master data ingestion.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-10">
        <div className="w-full md:w-[240px] shrink-0">
          <nav className="flex flex-col gap-1">
            {sidebarNav.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-4 py-2.5 text-left text-[14px] font-semibold transition-colors",
                    isActive
                      ? "bg-[var(--theme-accent-soft,#EFF3FF)] text-[var(--theme-accent,#2548C9)]"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.07] dark:hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex-1 min-w-0">
          {activeTab === "appearance" && <AppearanceSettings />}
          {activeTab === "risk-engine" && <RiskEngineSettings />}
          {activeTab === "team" && <TeamMembersTab />}
          {activeTab === "departments" && <DepartmentsTab />}
          {activeTab === "applications" && <ApplicationsTab />}
          {activeTab === "environments" && <EnvironmentsTab />}
          {activeTab === "users" && <UsersTab />}
          {activeTab === "integrations" && <VoiceUsagePanel />}

          {!masterDataTabs.has(activeTab) &&
            activeTab !== "team" &&
            activeTab !== "appearance" &&
            activeTab !== "risk-engine" &&
            activeTab !== "integrations" && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/50 py-24 text-center dark:border-[var(--border)] dark:bg-white/[0.025]">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm dark:border-[var(--border)] dark:bg-[var(--card)]">
                  <SettingsIcon className="h-6 w-6 text-gray-400 dark:text-gray-300" />
                </div>
                <h3 className="text-[16px] font-bold text-gray-900 dark:text-white">
                  Module Coming Soon
                </h3>
                <p className="mt-1 max-w-sm text-[14px] text-gray-500 dark:text-gray-300">
                  This configuration section is currently under development. Please check back
                  later.
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<TablePageSuspenseFallback />}>
      <SettingsPageInner />
    </Suspense>
  );
}
