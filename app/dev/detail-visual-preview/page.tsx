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
  Sparkles,
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
  EntityConnection,
  EntityTimeline,
  RiskMatrix,
  ThresholdVisual,
} from "@/components/detail/editable";
import { GlanceStrip, MockupSection } from "@/components/detail/MockupDetailChrome";
import { ReadinessGauge } from "@/components/gauges/ReadinessGauge";
import { ReleaseLifecycleStrip } from "@/components/releases/ReleaseLifecycleStrip";
import { ReleaseDashboardTile } from "@/components/releases/ReleaseDashboardTile";
import { ReleaseSummaryBar } from "@/components/releases/ReleaseSummaryBar";
import { ReleaseActionStrip } from "@/components/releases/ReleaseActionStrip";
import {
  ReadinessLifecycleContent,
  type CommandCenterData,
} from "@/components/releases/DbReleaseCommandCenter";
import { ThemeModeProvider, useThemeMode } from "@/context/ThemeModeContext";
import { cn } from "@/lib/utils";

type Tab = "release" | "operations" | "conflict" | "leave" | "blocker";

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
  const mockCommand: CommandCenterData = {
    readiness: 50,
    stages: [
      { id: "planning", label: "Planning", status: "complete", detail: "P4 · low priority" },
      { id: "scheduling", label: "Scheduling", status: "complete", detail: "2 bookings linked" },
      { id: "testing", label: "Testing", status: "complete", detail: "Apps scoped · test ready" },
      { id: "preparing", label: "Preparing", status: "blocked", detail: "1 blocker open" },
      { id: "managing", label: "Managing", status: "active", detail: "No-Go" },
      { id: "deployment", label: "Deployment", status: "pending", detail: "Ready to deploy" },
    ],
    nextActions: [
      {
        label: "Review blockers",
        href: "#blockers",
        detail: "BLK-0001: Shared UAT env with REL-0001",
      },
      { label: "Record Go / No-Go", href: "#go-nogo", detail: "Target in 3 day(s)" },
    ],
    prediction: {
      shipProbability: 40,
      delayRisk: 60,
      nudge: "60% slip risk — resolve FIN-TEST-01 environment collision before CAB",
      severity: "high",
    },
    p1Issues: [],
  };

  return (
    <PreviewChrome title="Release Command Center" code="REL-0001" name="Kyriba UI Tweak v4.5">
      <ReleaseSummaryBar headlineReadiness={50} slipRisk={60} envConflict />

      <div className="rounded-2xl border border-violet-200/70 border-l-[4px] border-l-violet-500 bg-gradient-to-r from-violet-50/80 via-white to-white px-4 py-3 shadow-sm dark:border-violet-500/30 dark:from-violet-500/10 dark:via-[var(--card)] dark:to-[var(--card)]">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
            <Sparkles size={15} aria-hidden />
          </span>
          <p className="text-[13px] font-bold text-slate-800 dark:text-white">AI Insights</p>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          <TintedCallout tone="rose">High Severity Blocker Present · BLK-0001 blocking go-live</TintedCallout>
          <TintedCallout tone="amber">Recommended: Review blockers</TintedCallout>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ReleaseDashboardTile
          icon={Rocket}
          tone="violet"
          title="Readiness & Lifecycle"
          subtitle="How far along this release is, and its chance of shipping on time. (Readiness % is shown above.)"
          detail="Tracks progress from planning through to go-live. 'Current stage' is where the release sits in that journey. 'Chance of shipping on time' is a live prediction from readiness, blockers, and time remaining — different from 'Team's estimate', which is the readiness % your team typed in manually."
          href="section-readiness"
          hero={{
            value: "40%",
            label: "Chance of shipping on time",
            hint: "Live prediction of whether this release will hit its planned go-live date.",
          }}
          metrics={[
            { label: "Current stage", value: "Preparing", hint: "Where this release sits in the journey." },
            { label: "Live readiness", value: "50%", hint: "Computed readiness from live signals." },
            { label: "Team's estimate", value: "75%", hint: "Manual readiness % entered by the team." },
            { label: "Prep checklist", value: "79%", hint: "Go-live checklist completion." },
            { label: "Slip risk", value: "60%", hint: "Chance this release finishes late." },
            { label: "Time left", value: "4 days", hint: "Days until planned go-live." },
          ]}
        />
        <ReleaseDashboardTile
          icon={AlertTriangle}
          tone="rose"
          title="Blockers & Conflicts"
          subtitle="Issues that could stop or delay this release, including any environment double-booking."
          detail="Lists anything actively stopping or delaying this release — open issues, environment double-bookings, or change freeze windows. Resolve these before recording a Go decision."
          href="blockers"
          hero={{
            value: "1",
            label: "Open issue blocking this release",
            hint: "Count of open blocker tickets.",
          }}
          metrics={[
            { label: "How serious", value: "High", hint: "Highest open blocker severity." },
            { label: "Env conflict", value: "Yes — clash detected", hint: "Environment double-booking flag." },
            { label: "Conflict reference", value: "CNF-0001", hint: "Conflict ticket ID." },
            { label: "Conflicts with", value: "REL-0003", hint: "Other release in the clash." },
            { label: "Conflict type", value: "Same Test/UAT env", hint: "Kind of scheduling clash." },
            { label: "Change freeze", value: "Quarter-End", hint: "Restricted change window." },
          ]}
        />
        <ReleaseDashboardTile
          icon={Server}
          tone="sky"
          title="Environments & Bookings"
          subtitle="The test/UAT environments this release needs, and whether another team has already booked them."
          detail="Shows which Test and UAT environments this release needs, who booked them, and for which dates. Overlapping bookings with another release are flagged as a conflict."
          href="section-environments"
          hero={{
            value: "2",
            label: "Environment bookings on file",
            hint: "Linked environment booking count.",
          }}
          metrics={[
            { label: "Test environment", value: "FIN-TEST-01", hint: "Required Test env." },
            { label: "UAT environment", value: "FIN-UAT-01", hint: "Required UAT env." },
            { label: "Booked by", value: "Priya", hint: "Who reserved the booking." },
            { label: "Team", value: "Finance QA", hint: "Team owning the booking." },
            { label: "Booking window", value: "17 Jul → 19 Jul", hint: "Booking date range." },
            { label: "Purpose", value: "UAT regression", hint: "Why the env was booked." },
          ]}
        />
        <ReleaseDashboardTile
          icon={CheckCircle2}
          tone="emerald"
          title="Key Dates & Approvals"
          subtitle="The review date, go-live date, and required sign-offs before this release can ship."
          detail="Shows the CAB review date, the planned go-live date, and the deployment window, plus the 5 required sign-offs that should be complete before a Go decision."
          href="section-dates"
          hero={{
            value: "1/5",
            label: "Required sign-offs approved",
            hint: "How many of 5 required gates are done.",
          }}
          metrics={[
            { label: "Review date (CAB)", value: "18 Jul", hint: "Change Advisory Board review date." },
            { label: "Start date", value: "14 Jul", hint: "Release start date." },
            { label: "Go-live date", value: "22 Jul", hint: "Planned production date." },
            { label: "Deployment window", value: "Sat night", hint: "Agreed deploy slot." },
            { label: "Approval status", value: "Pending", hint: "Overall approval state." },
            { label: "Rollback plan", value: "On file", hint: "Undo plan if go-live fails." },
          ]}
        />
      </div>

      <ReleaseActionStrip
        status="Blocked"
        decision="No-Go — blocked"
        canEdit
        onPatchStatus={() => undefined}
        onRecordDecision={() => undefined}
      />

      <div className="space-y-4">
        <p className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
          Deep dive
        </p>
        <DetailSection
          id="section-readiness"
          icon={Rocket}
          tone="violet"
          title="Readiness & Lifecycle"
          description="Computed readiness, lifecycle stage, and next best actions."
        >
          <ReadinessLifecycleContent data={mockCommand} storedReadiness={75} checklistPercent={79} />
        </DetailSection>
        <DetailSection
          id="blockers"
          icon={AlertTriangle}
          tone="rose"
          title="Blockers & Conflicts"
          description="Environment collisions and live blocker rows."
        >
          <TintedCallout tone="rose">
            Resource conflict with REL-0003 — Same Test/UAT environment required. Active blocker BLK-0001.
          </TintedCallout>
        </DetailSection>
        <DetailSection
          id="section-environments"
          icon={Server}
          tone="sky"
          title="Environments & Bookings"
          description="Required TEST/UAT environments and linked bookings."
        >
          <EmptyHint>Live page shows ENV-0081 / ENV-0001 booking rows.</EmptyHint>
        </DetailSection>
        <DetailSection
          id="section-dates"
          icon={CheckCircle2}
          tone="emerald"
          title="Key Dates & Approvals"
          description="CAB timing and go-live sign-off gates."
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
      </div>

      <div className="space-y-4">
        <p className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
          More detail
        </p>
        <DetailSection
          icon={Package}
          tone="indigo"
          title="Release Information"
          description="P4 · Low · Finance · Kyriba"
        >
          <EmptyHint>Full identity fields render on the live release page.</EmptyHint>
        </DetailSection>
        <DetailSection
          icon={History}
          tone="violet"
          title="Audit Trail"
          description="1 event · decisions, status changes, and notes"
        >
          <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm dark:bg-white/5">
            <span className="text-[10.5px] text-slate-400">14 Jul 2026, 12:40 pm · Release Manager</span>
            <p className="text-slate-700 dark:text-white/75">Decision — No-Go, environment conflict unresolved</p>
          </div>
        </DetailSection>
      </div>
    </PreviewChrome>
  );
}

function OperationsPreview() {
  return (
    <PreviewChrome title="Operational Detail System" code="RISK-0042" name="Shared v2 layout for ten entity pages">
      <MockupSection title="Risk Status At A Glance">
        <GlanceStrip
          items={[
            { label: "Risk Score", value: "20 / 25", tone: "bad" },
            { label: "Status", value: "Mitigating", tone: "warn" },
            { label: "Owner", value: "Platform Operations" },
          ]}
        />
      </MockupSection>
      <div className="grid gap-4 lg:grid-cols-2">
        <MockupSection title="Risk Exposure Matrix">
          <RiskMatrix likelihood={4} impact={5} />
        </MockupSection>
        <MockupSection title="Metric Details">
          <ThresholdVisual current={92} threshold={80} unit="%" />
        </MockupSection>
      </div>
      <MockupSection title="Environment Journey">
        <EntityTimeline
          phases={[
            { label: "Test", detail: "14 Jul → 16 Jul", complete: true, tone: "sky" },
            { label: "UAT", detail: "17 Jul → 19 Jul", active: true, tone: "violet" },
            { label: "Pre-Prod", detail: "20 Jul → 21 Jul", tone: "amber" },
            { label: "Production", detail: "22 Jul", tone: "emerald" },
          ]}
        />
      </MockupSection>
      <MockupSection title="Dependency Flow">
        <EntityConnection
          source="REL-1042 · Payments API"
          target="REL-1047 · Customer Portal"
          caption="Hard dependency · release delay if blocked"
        />
      </MockupSection>
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
            data-preview-tab="operations"
            onClick={() => setTab("operations")}
            className={cn(
              "rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors",
              tab === "operations"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 shadow-sm dark:bg-white/10 dark:text-white/70"
            )}
          >
            Operations
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
      {tab === "operations" && <OperationsPreview />}
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
