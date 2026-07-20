"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Boxes, GitBranch, Grid3X3, Network, Server } from "lucide-react";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { TopBar } from "@/components/layout/TopBar";
import { CriticalPaths } from "@/components/system-mapping/CriticalPaths";
import { DepartmentMatrix } from "@/components/system-mapping/DepartmentMatrix";
import { ReleaseManagerSidebar } from "@/components/system-mapping/ReleaseManagerSidebar";
import { SharedEnvironments } from "@/components/system-mapping/SharedEnvironments";
import { SystemsHub } from "@/components/system-mapping/SystemsHub";
import { VisualMap } from "@/components/system-mapping/VisualMap";
import type { SessionUser } from "@/lib/auth/roles";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";

const TABS = [
  { id: "systems", label: "Systems Hub", icon: Boxes },
  { id: "visual", label: "Visual Map", icon: Network },
  { id: "matrix", label: "Department Matrix", icon: Grid3X3 },
  { id: "environments", label: "Shared Environments", icon: Server },
  { id: "paths", label: "Critical Paths", icon: GitBranch },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_IDS = new Set<string>(TABS.map((tab) => tab.id));

/**
 * Resolve the active System Mapping tab from the URL `tab` query param.
 *
 * @param value - Raw search-param value (may be null/unknown).
 * @returns A known tab id; defaults to Systems Hub.
 */
function resolveTab(value: string | null): TabId {
  if (value && TAB_IDS.has(value)) return value as TabId;
  return "systems";
}

/** Responsive System Mapping workspace backed by the mapping domain APIs. */
export function SystemMappingContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => resolveTab(searchParams.get("tab")));
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    setActiveTab(resolveTab(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/me", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const canEdit = sessionCanEdit(user);

  /**
   * Switch tabs and keep the selection shareable via `?tab=`.
   *
   * @param id - Target tab id.
   * @sideEffects Updates the URL search params (no scroll).
   */
  const selectTab = (id: TabId) => {
    setActiveTab(id);
    const next = new URLSearchParams(searchParams.toString());
    if (id === "systems") next.delete("tab");
    else next.set("tab", id);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="min-w-0">
      <TopBar
        pageKey="system-mapping"
        title="System Mapping"
        subtitle="Catalog systems, then open Visual Map to see clear upstream and downstream links — one system at a time"
        trailing={<PageDocumentation pageKey="system-mapping" />}
      />

      <div
        className="mb-5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-sm dark:border-[var(--border)] dark:bg-[var(--card)]"
        role="tablist"
        aria-label="System Mapping sections"
      >
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
                onClick={() => selectTab(id)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  selected
                    ? "bg-brand-600 text-white shadow-sm shadow-brand-200/50 dark:shadow-none"
                    : "text-slate-600 hover:bg-slate-50 hover:text-brand-700 dark:text-gray-300 dark:hover:bg-brand-500/10 dark:hover:text-brand-300"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={
          activeTab === "visual"
            ? "min-w-0"
            : "grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]"
        }
      >
        <main
          role="tabpanel"
          id={`system-mapping-panel-${activeTab}`}
          aria-labelledby={`system-mapping-tab-${activeTab}`}
          className={activeTab === "visual" ? "min-w-0" : "order-last min-w-0 lg:order-first"}
        >
          {activeTab === "systems" && <SystemsHub canEdit={canEdit} />}
          {activeTab === "matrix" && <DepartmentMatrix canEdit={canEdit} />}
          {activeTab === "environments" && <SharedEnvironments canEdit={canEdit} />}
          {activeTab === "paths" && <CriticalPaths canEdit={canEdit} />}
          {activeTab === "visual" && <VisualMap />}
        </main>
        {activeTab !== "visual" ? <ReleaseManagerSidebar /> : null}
      </div>
    </div>
  );
}
