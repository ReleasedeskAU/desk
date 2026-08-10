"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  Bell,
  ClipboardCheck,
  FileCheck2,
  GitBranch,
  Link2,
  GitCompare,
  Siren,
  Swords,
} from "lucide-react";
import { TablePageSuspenseFallback } from "@/components/ui/TableSkeleton";
import { ReleaseLifecycleSettings } from "@/components/settings/ReleaseLifecycleSettings";
import { BlockerLifecycleSettings } from "@/components/settings/BlockerLifecycleSettings";
import { ApprovalLifecycleSettings } from "@/components/settings/ApprovalLifecycleSettings";
import { SignoffLifecycleSettings } from "@/components/settings/SignoffLifecycleSettings";
import { RiskLifecycleSettings } from "@/components/settings/RiskLifecycleSettings";
import { IncidentLifecycleSettings } from "@/components/settings/IncidentLifecycleSettings";
import { DependencyLifecycleSettings } from "@/components/settings/DependencyLifecycleSettings";
import { ConflictLifecycleSettings } from "@/components/settings/ConflictLifecycleSettings";
import { DriftLifecycleSettings } from "@/components/settings/DriftLifecycleSettings";
import { AlertLifecycleSettings } from "@/components/settings/AlertLifecycleSettings";
import { cn } from "@/lib/utils";

const VALID_TABS = new Set([
  "releases",
  "blockers",
  "approvals",
  "signoffs",
  "risks",
  "incidents",
  "dependencies",
  "conflicts",
  "drifts",
  "alerts",
]);

/**
 * Lifecycle settings hub for all entity workflows (releases through alerts).
 */
function LifecyclePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initial =
    tabParam && VALID_TABS.has(tabParam) ? tabParam : "releases";
  const [activeTab, setActiveTab] = useState(initial);

  useEffect(() => {
    if (tabParam && VALID_TABS.has(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam, activeTab]);

  const setTab = (id: string) => {
    setActiveTab(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id === "releases") params.delete("tab");
    else params.set("tab", id);
    const qs = params.toString();
    router.replace(qs ? `/lifecycle?${qs}` : "/lifecycle", { scroll: false });
  };

  const tabs = [
    { id: "releases", label: "Release Lifecycle", icon: GitBranch },
    { id: "blockers", label: "Blocker Lifecycle", icon: Ban },
    { id: "approvals", label: "Approval Lifecycle", icon: ClipboardCheck },
    { id: "signoffs", label: "Sign-off Lifecycle", icon: FileCheck2 },
    { id: "risks", label: "Risk Lifecycle", icon: AlertTriangle },
    { id: "incidents", label: "Incident Lifecycle", icon: Siren },
    { id: "dependencies", label: "Dependency Lifecycle", icon: Link2 },
    { id: "conflicts", label: "Conflict Lifecycle", icon: Swords },
    { id: "drifts", label: "Drift Lifecycle", icon: GitCompare },
    { id: "alerts", label: "Alert Lifecycle", icon: Bell },
  ] as const;

  return (
    <div className="max-w-[1200px] pb-24 font-sans">
      <div className="mb-8 mt-2">
        <h1 className="mb-2 text-[32px] font-bold tracking-tight text-gray-900 dark:text-white">
          Lifecycle
        </h1>
        <p className="text-[15px] font-medium leading-relaxed text-gray-500 dark:text-gray-300">
          Configure entity workflows — releases through alerts — for your account.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setTab(item.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors",
                isActive
                  ? "bg-brand-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-white/70"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {activeTab === "releases" ? <ReleaseLifecycleSettings /> : null}
      {activeTab === "blockers" ? <BlockerLifecycleSettings /> : null}
      {activeTab === "approvals" ? <ApprovalLifecycleSettings /> : null}
      {activeTab === "signoffs" ? <SignoffLifecycleSettings /> : null}
      {activeTab === "risks" ? <RiskLifecycleSettings /> : null}
      {activeTab === "incidents" ? <IncidentLifecycleSettings /> : null}
      {activeTab === "dependencies" ? <DependencyLifecycleSettings /> : null}
      {activeTab === "conflicts" ? <ConflictLifecycleSettings /> : null}
      {activeTab === "drifts" ? <DriftLifecycleSettings /> : null}
      {activeTab === "alerts" ? <AlertLifecycleSettings /> : null}
    </div>
  );
}

export default function LifecyclePage() {
  return (
    <Suspense fallback={<TablePageSuspenseFallback />}>
      <LifecyclePageInner />
    </Suspense>
  );
}
