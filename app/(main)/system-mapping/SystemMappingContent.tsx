"use client";

import { useEffect, useState } from "react";
import { Boxes, GitBranch, Grid3X3, Server } from "lucide-react";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { TopBar } from "@/components/layout/TopBar";
import { CriticalPaths } from "@/components/system-mapping/CriticalPaths";
import { DepartmentMatrix } from "@/components/system-mapping/DepartmentMatrix";
import { ReleaseManagerSidebar } from "@/components/system-mapping/ReleaseManagerSidebar";
import { SharedEnvironments } from "@/components/system-mapping/SharedEnvironments";
import { SystemsHub } from "@/components/system-mapping/SystemsHub";
import type { SessionUser } from "@/lib/auth/roles";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";

const TABS = [
  { id: "systems", label: "Systems Hub", icon: Boxes },
  { id: "matrix", label: "Department Matrix", icon: Grid3X3 },
  { id: "environments", label: "Shared Environments", icon: Server },
  { id: "paths", label: "Critical Paths", icon: GitBranch },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Responsive System Mapping workspace backed by the mapping domain APIs. */
export function SystemMappingContent() {
  const [activeTab, setActiveTab] = useState<TabId>("systems");
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/me", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const canEdit = sessionCanEdit(user);

  return (
    <div className="min-w-0">
      <TopBar
        pageKey="system-mapping"
        title="System Mapping"
        subtitle="Systems, department relationships, shared infrastructure, and release-critical paths"
        trailing={<PageDocumentation pageKey="system-mapping" />}
      />

      <div className="mb-5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm dark:border-[var(--border)] dark:bg-[var(--card)]" role="tablist" aria-label="System Mapping sections">
        <div className="flex min-w-max gap-1">
          {TABS.map(({ id, label, icon: Icon }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`system-mapping-tab-${id}`}
                aria-selected={selected}
                aria-controls={`system-mapping-panel-${id}`}
                onClick={() => setActiveTab(id)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  selected
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-gray-600 hover:bg-brand-50 hover:text-brand-700 dark:text-gray-300 dark:hover:bg-brand-500/10 dark:hover:text-brand-300"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main
          role="tabpanel"
          id={`system-mapping-panel-${activeTab}`}
          aria-labelledby={`system-mapping-tab-${activeTab}`}
          className="order-last min-w-0 lg:order-first"
        >
          {activeTab === "systems" && <SystemsHub canEdit={canEdit} />}
          {activeTab === "matrix" && <DepartmentMatrix canEdit={canEdit} />}
          {activeTab === "environments" && <SharedEnvironments canEdit={canEdit} />}
          {activeTab === "paths" && <CriticalPaths canEdit={canEdit} />}
        </main>
        <ReleaseManagerSidebar />
      </div>
    </div>
  );
}
