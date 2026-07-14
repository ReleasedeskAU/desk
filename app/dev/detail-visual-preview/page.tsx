"use client";

/**
 * Dev-only visual QA page for Release / Conflict / Leave / Blocker detail redesign.
 * Public in development (see proxy.ts) so screenshots can be taken without Clerk.
 * Uses the same shared shell components as the real detail pages.
 */
import { useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Calendar,
  CalendarOff,
  CheckCircle2,
  FileText,
  Gauge,
  History,
  ListChecks,
  Megaphone,
  Package,
  Rocket,
  Server,
  ShieldAlert,
  SlidersHorizontal,
  User,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import {
  DetailSection,
  EmptyHint,
  HeroStatusRow,
  LockedIdField,
  EditableField,
  EditableFieldGrid,
  SignoffChip,
  StatusChip,
  ScoreBar,
  TintedCallout,
} from "@/components/detail/editable";
import { ReadinessGauge } from "@/components/gauges/ReadinessGauge";
import { ReleaseLifecycleStrip } from "@/components/releases/ReleaseLifecycleStrip";
import { ThemeModeProvider, useThemeMode } from "@/context/ThemeModeContext";
import { cn } from "@/lib/utils";

type Tab = "release" | "conflict" | "leave" | "blocker";

function PreviewChrome({
  title,
  code,
  name,
  children,
}: {
  title: string;
  code: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1080px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold text-slate-400 dark:text-white/45">{title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-[26px] font-bold tracking-tight text-[#1B2559] dark:text-white">{name}</h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-500 dark:bg-white/10 dark:text-white/60">
              {code}
            </span>
          </div>
          <p className="mt-1 text-[12.5px] text-slate-400 dark:text-white/50">
            Visual preview — same shared components as the live detail pages.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            Delete
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-indigo-200"
          >
            Edit {title.replace(" Detail", "")}
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

function ReleasePreview() {
  return (
    <PreviewChrome title="Release Detail" code="REL-0001" name="Kyriba UI Tweak v4.5">
      <div className="rounded-[22px] bg-white px-5 py-4 shadow-[0_16px_36px_-24px_rgba(112,144,176,0.25)] dark:bg-[var(--card)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Select release</p>
            <p className="mt-1 font-mono text-[13px] font-bold text-slate-700 dark:text-white/75">REL-0001</p>
          </div>
          <p className="text-[11px] text-slate-400">Last refresh: 14 Jul 2026, 12:46 pm</p>
        </div>
      </div>

      <HeroStatusRow
        hero={{ icon: ShieldAlert, label: "Release Health", value: "No-Go", tone: "rose" }}
        secondary={{ icon: Zap, label: "Status", value: "Blocked" }}
        metric={{
          icon: CheckCircle2,
          label: "Operational Readiness",
          percent: 60,
          caption: "computed from live operational signals",
          tone: "amber",
        }}
      />

      <TintedCallout tone="rose">
        Predictive nudge: environment conflict with REL-0003 is the primary ship-risk driver. Resolve the booking
        collision before CAB.
      </TintedCallout>

      <DetailSection
        icon={Rocket}
        tone="violet"
        title="Release lifecycle"
        description="A live view of progress from planning and scheduling through deployment."
      >
        <ReleaseLifecycleStrip
          embedded
          stages={[
            { id: "planning", label: "Planning", status: "complete", detail: "P4 · low priority" },
            { id: "scheduling", label: "Scheduling", status: "complete", detail: "2 bookings linked" },
            { id: "testing", label: "Testing", status: "complete", detail: "Apps scoped · test ready" },
            { id: "preparing", label: "Preparing", status: "blocked", detail: "1 blocker open" },
            { id: "managing", label: "Managing", status: "active", detail: "No-Go" },
            { id: "deployment", label: "Deployment", status: "pending", detail: "Ready to deploy" },
          ]}
        />
      </DetailSection>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DetailSection
          icon={Gauge}
          tone="emerald"
          title="Readiness signals"
          description="Computed readiness alongside stored planning and checklist progress."
        >
          <div className="grid items-center gap-5 sm:grid-cols-[150px_1fr]">
            <div className="flex flex-col items-center">
              <ReadinessGauge value={60} size={140} />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Computed live</span>
            </div>
            <div className="space-y-4">
              <ScoreBar value={75} asPercent label="Stored readiness" />
              <ScoreBar value={79} asPercent label="Go-live checklist" />
            </div>
          </div>
        </DetailSection>
        <DetailSection
          icon={ListChecks}
          tone="amber"
          title="Next best actions"
          description="The highest-value steps to move this release safely toward deployment."
        >
          <div className="space-y-2">
            <TintedCallout tone="amber">Resolve FIN-TEST-01 environment collision.</TintedCallout>
            <TintedCallout tone="violet">Complete Test, UAT, and Security sign-offs.</TintedCallout>
          </div>
        </DetailSection>
      </div>

      <DetailSection
        icon={SlidersHorizontal}
        tone="indigo"
        title="Release controls"
        description="Update operational status and record the deployment decision without leaving this page."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-wrap gap-2">
            <StatusChip label="Planned" tone="neutral" />
            <StatusChip label="In Progress" tone="neutral" />
            <StatusChip label="Blocked" tone="bad" />
            <StatusChip label="At Risk" tone="warn" />
            <StatusChip label="Complete" tone="neutral" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
              Record Go
            </button>
            <button type="button" className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white">
              Record No-Go
            </button>
          </div>
        </div>
      </DetailSection>

      <DetailSection
        icon={AlertTriangle}
        tone="rose"
        title="Blockers & conflicts"
        description="Anything actively stopping the release, including environment collisions and live blockers."
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <StatusChip label="⚠ Conflict detected" tone="bad" />
          <StatusChip label="Quarter-End Freeze" tone="warn" />
        </div>
        <TintedCallout tone="rose">
          Resource conflict with REL-0003 — Same Test/UAT environment required.
        </TintedCallout>
      </DetailSection>

      <DetailSection
        icon={CheckCircle2}
        tone="emerald"
        title="Sign-offs & approvals"
        description="Every formal gate that must clear before the deployment decision can safely move to Go."
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <SignoffChip label="Dev sign-off" done />
          <SignoffChip label="Test sign-off" done={false} />
          <SignoffChip label="UAT sign-off" done={false} />
          <SignoffChip label="Security clearance" done={false} />
          <SignoffChip label="Dress rehearsal" done={false} />
          <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/5">
            <ScoreBar value={79} asPercent label="Go-live checklist" />
          </div>
        </div>
      </DetailSection>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DetailSection
          icon={Megaphone}
          tone="amber"
          title="Communications & training"
          description="Human readiness across hypercare, stakeholder messaging, and enablement."
        >
          <EditableFieldGrid>
            <EditableField label="Hypercare Plan" value="Not Started" editing={false} />
            <EditableField label="Comms Plan" value="Draft" editing={false} />
          </EditableFieldGrid>
        </DetailSection>
        <DetailSection
          icon={Users}
          tone="indigo"
          title="Stakeholders & contacts"
          description="Accountability, interested parties, and regulatory context."
        >
          <EditableFieldGrid>
            <EditableField label="Release Owner" value="USR-061" editing={false} mono />
            <EditableField label="Stakeholders" value="USR-073, USR-085, USR-097" editing={false} mono />
          </EditableFieldGrid>
        </DetailSection>
      </div>

      <DetailSection
        icon={History}
        tone="violet"
        title="Audit trail"
        description="Immutable operational history, decisions, status changes, and release notes."
      >
        <div className="space-y-2">
          <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm dark:bg-white/5">
            <span className="text-[10.5px] text-slate-400">14 Jul 2026, 12:40 pm · Release Manager</span>
            <p className="text-slate-700 dark:text-white/75">Decision — No-Go, environment conflict unresolved</p>
          </div>
        </div>
      </DetailSection>
    </PreviewChrome>
  );
}

function ConflictPreview() {
  return (
    <PreviewChrome title="Conflict Detail" code="CNF-0001" name="Env double-book — FIN-TEST-01">
      <HeroStatusRow
        hero={{ icon: ShieldAlert, label: "Priority", value: "P1 - Critical", tone: "rose" }}
        secondary={{ icon: Zap, label: "Status", value: "Open" }}
        metric={{
          icon: AlertTriangle,
          label: "Resolution",
          percent: 25,
          caption: "still needs clearing",
          tone: "amber",
        }}
      />
      <DetailSection
        icon={AlertTriangle}
        tone="rose"
        title="Conflict status"
        description="Anything actively blocking these releases from sharing the same env window."
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusChip label="⚠️ CONFLICT OPEN" tone="bad" />
          <span className="text-[12px] text-slate-500">between</span>
          <span className="font-mono text-[12px] font-bold text-indigo-600">REL-0001</span>
          <span className="text-[12px] text-slate-400">&</span>
          <span className="font-mono text-[12px] font-bold text-indigo-600">REL-0003</span>
        </div>
        <EditableFieldGrid cols={3}>
          <LockedIdField label="Conflict ID" value="CNF-0001" />
          <EditableField label="Status" value="Open" editing={false} display={<StatusChip label="Open" tone="bad" />} />
          <EditableField
            label="Priority"
            value="P1 - Critical"
            editing={false}
            display={<StatusChip label="P1 - Critical" tone="bad" />}
          />
        </EditableFieldGrid>
      </DetailSection>
      <DetailSection
        icon={Server}
        tone="sky"
        title="Environment conflict details"
        description="Which environment overlaps, and what kind of clash it is."
      >
        <EditableFieldGrid>
          <EditableField label="Conflicting Env" value="FIN-TEST-01" editing={false} mono />
          <EditableField label="Conflict Type" value="Same Test/UAT env required" editing={false} />
        </EditableFieldGrid>
      </DetailSection>
      <DetailSection
        icon={FileText}
        tone="amber"
        title="Notes & resolution"
        description="Context for CAB, owners, and how this conflict should be cleared."
      >
        <TintedCallout tone="rose">
          Resource conflict with REL-0003 — Same Test/UAT env required. Resolve before go-live.
        </TintedCallout>
      </DetailSection>
    </PreviewChrome>
  );
}

function LeavePreview() {
  return (
    <PreviewChrome title="Leave Detail" code="LVE-0004" name="Aisha Rahman">
      <HeroStatusRow
        hero={{ icon: ShieldAlert, label: "Coverage Status", value: "Partial", tone: "amber" }}
        secondary={{ icon: Zap, label: "Leave Type", value: "Annual" }}
        metric={{
          icon: ShieldAlert,
          label: "Risk Safety",
          percent: 40,
          caption: "High risk (score 6/10)",
          tone: "amber",
        }}
      />
      <DetailSection
        icon={CalendarOff}
        tone="violet"
        title="Leave identity"
        description="What kind of absence this is, and the permanent leave ID."
      >
        <EditableFieldGrid cols={3}>
          <LockedIdField label="Leave ID" value="LVE-0004" />
          <EditableField label="Leave Type" value="Annual" editing={false} display={<StatusChip label="Annual" tone="info" />} />
          <EditableField
            label="Coverage"
            value="Partial"
            editing={false}
            display={<StatusChip label="Partial" tone="warn" />}
          />
        </EditableFieldGrid>
      </DetailSection>
      <DetailSection
        icon={ShieldAlert}
        tone="rose"
        title="Release impact"
        description="Releases that may be affected while this person is away."
      >
        <div className="mb-4 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/5">
          <ScoreBar value={6} max={10} label="High risk" />
        </div>
        <EditableField label="Risk Impact" value="Partial coverage — backup not confirmed" editing={false} />
      </DetailSection>
      <DetailSection
        icon={User}
        tone="amber"
        title="Coverage plan"
        description="Who covers the role while they’re away — not stored on this record yet."
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <SignoffChip label="Cover assignee" done={false} />
          <SignoffChip label="Handover complete" done={false} />
        </div>
        <div className="mt-3">
          <EmptyHint>No coverage assignee recorded for this leave yet.</EmptyHint>
        </div>
      </DetailSection>
    </PreviewChrome>
  );
}

function BlockerPreview() {
  return (
    <PreviewChrome title="Blocker Detail" code="BLK-0002" name="Missing security clearance">
      <HeroStatusRow
        hero={{ icon: AlertOctagon, label: "Severity", value: "Critical", tone: "rose" }}
        secondary={{ icon: Zap, label: "Status", value: "Open" }}
        metric={{
          icon: CheckCircle2,
          label: "Clearance",
          percent: 18,
          caption: "12 days open",
          tone: "rose",
        }}
      />
      <DetailSection
        icon={AlertOctagon}
        tone="rose"
        title="Blocker status"
        description="How severe this is, whether it’s still open, and how long it’s been blocking."
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusChip label="⚠️ BLOCKING" tone="bad" />
          <StatusChip label="Critical" tone="bad" />
          <StatusChip label="Open" tone="bad" />
        </div>
        <EditableFieldGrid cols={3}>
          <LockedIdField label="Blocker ID" value="BLK-0002" />
          <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/5">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Days Open</p>
            <ScoreBar value={12} max={30} label="12 days" />
          </div>
        </EditableFieldGrid>
      </DetailSection>
      <DetailSection
        icon={FileText}
        tone="indigo"
        title="Blocker information"
        description="What category of blocker this is and the description owners see first."
      >
        <TintedCallout tone="amber">
          Security clearance for production deploy still pending — CAB will not approve until cleared.
        </TintedCallout>
      </DetailSection>
      <DetailSection
        icon={Wrench}
        tone="emerald"
        title="Resolution progress"
        description="Root cause and the plan to clear this blocker."
      >
        <div className="space-y-3">
          <TintedCallout tone="amber">Vendor background check delayed.</TintedCallout>
          <TintedCallout tone="emerald">Chase InfoSec; target clearance before CAB on 14-Jul.</TintedCallout>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <SignoffChip label="Assignee set" done />
          <SignoffChip label="Escalation target" done={false} />
        </div>
      </DetailSection>
      <DetailSection
        icon={Calendar}
        tone="violet"
        title="Timeline"
        description="When it was raised and the target / actual resolution dates."
      >
        <EditableFieldGrid>
          <EditableField label="Raised Date" value="02-Jul-26" editing={false} />
          <EditableField label="Target Resolution" value="14-Jul-26" editing={false} />
          <EditableField label="Actual Resolution" value="—" editing={false} />
        </EditableFieldGrid>
      </DetailSection>
      <DetailSection
        icon={Package}
        tone="sky"
        title="Affected release"
        description="Which release is blocked and how hard the impact hits go-live."
      >
        <EditableFieldGrid>
          <EditableField label="Release ID" value="REL-0001" editing={false} mono />
          <EditableField label="Impact on Release" value="Blocks go-live" editing={false} />
        </EditableFieldGrid>
      </DetailSection>
    </PreviewChrome>
  );
}

function DetailVisualPreviewContent() {
  const [tab, setTab] = useState<Tab>("release");
  const { mode, setMode } = useThemeMode();
  const dark = mode === "dark";

  const toggleTheme = () => setMode(dark ? "light" : "dark");

  return (
    <div
      className={cn("min-h-screen p-6 md:p-9", dark ? "bg-slate-950 text-white" : "bg-[#F4F7FE] text-slate-900")}
      style={{ fontFamily: "'Plus Jakarta Sans','DM Sans',ui-sans-serif,system-ui,sans-serif" }}
    >
      <div className="mx-auto mb-6 flex max-w-[1080px] flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            data-preview-tab="release"
            onClick={() => setTab("release")}
            className={cn(
              "rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors",
              tab === "release"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 shadow-sm dark:bg-white/10 dark:text-white/70"
            )}
          >
            Release
          </button>
          <button
            type="button"
            data-preview-tab="conflict"
            onClick={() => setTab("conflict")}
            className={cn(
              "rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors",
              tab === "conflict"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 shadow-sm dark:bg-white/10 dark:text-white/70"
            )}
          >
            Conflict
          </button>
          <button
            type="button"
            data-preview-tab="leave"
            onClick={() => setTab("leave")}
            className={cn(
              "rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors",
              tab === "leave"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 shadow-sm dark:bg-white/10 dark:text-white/70"
            )}
          >
            Leave
          </button>
          <button
            type="button"
            data-preview-tab="blocker"
            onClick={() => setTab("blocker")}
            className={cn(
              "rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors",
              tab === "blocker"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 shadow-sm dark:bg-white/10 dark:text-white/70"
            )}
          >
            Blocker
          </button>
        </div>
        <button
          type="button"
          data-preview-theme="toggle"
          onClick={toggleTheme}
          className="rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-slate-600 shadow-sm dark:bg-white/10 dark:text-white/70"
        >
          {dark ? "Light mode" : "Dark mode"}
        </button>
      </div>

      {tab === "release" && <ReleasePreview />}
      {tab === "conflict" && <ConflictPreview />}
      {tab === "leave" && <LeavePreview />}
      {tab === "blocker" && <BlockerPreview />}
    </div>
  );
}

/** Mount the visual QA surface with the same theme context as the authenticated app shell. */
export default function DetailVisualPreviewPage() {
  return (
    <ThemeModeProvider>
      <DetailVisualPreviewContent />
    </ThemeModeProvider>
  );
}
