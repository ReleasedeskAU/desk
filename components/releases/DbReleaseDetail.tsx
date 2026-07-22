"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import {
  ConfirmDeleteDialog,
  DetailSection,
  EmptyHint,
  ScoreBar,
  SignoffChip,
  StatusChip,
  TintedCallout,
  type ChipTone,
} from "@/components/detail/editable";
import {
  ReadinessLifecycleContent,
  useReleaseCommandCenter,
} from "@/components/releases/DbReleaseCommandCenter";
import { ReleaseDashboardTile } from "@/components/releases/ReleaseDashboardTile";
import { ReleaseSummaryBar } from "@/components/releases/ReleaseSummaryBar";
import { ReleaseActionStrip } from "@/components/releases/ReleaseActionStrip";
import { DbBlockerList } from "@/components/releases/DbBlockerList";
import { DbReleaseDriftList } from "@/components/releases/DbReleaseDriftList";
import { DbAIRiskPanel } from "@/components/releases/DbAIRiskPanel";
import { DbLinkedWorkItems } from "@/components/releases/DbLinkedWorkItems";
import { DbReleaseServicesInvolved } from "@/components/releases/DbReleaseServicesInvolved";
import { StakeholderCommsPanel } from "@/components/releases/StakeholderCommsPanel";
import { ReleaseFormModal } from "@/components/releases/ReleaseFormModal";
import { taBtnSecondary, taInput } from "@/lib/styles";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth/roles";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import { loadJsonEffect, safeFetchJson } from "@/lib/safe-fetch";
import {
  openDetailsFromHash,
  pickHeadlineReadiness,
  pickUrgentNextAction,
} from "@/lib/release-detail-layout";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  FileText,
  GitCompareArrows,
  History,
  Link2,
  Megaphone,
  Package,
  Pencil,
  Rocket,
  Server,
  Trash2,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";

type ReleaseDetail = {
  id: string;
  releaseCode: string;
  name: string;
  programProject: string | null;
  owner: string;
  status: string;
  releaseDate: string;
  priority: string;
  impact: string;
  notes: string | null;
  decision: string | null;
  departmentId: string;
  department: { name: string };
  releaseSize?: string | null;
  cabDate?: string | null;
  startDate?: string | null;
  testEnvRequired?: string | null;
  uatEnvRequired?: string | null;
  conflictFlag?: boolean;
  readinessPercent?: number | null;
  blockers?: string | null;
  vendorMaintenance?: string | null;
  changeFreeze?: string | null;
  regulatory?: string | null;
  approvalStatus?: string | null;
  rollbackPlan?: string | null;
  goLiveChecklistPercent?: number | null;
  deploymentWindow?: string | null;
  dependencies?: string | null;
  conflictId?: string | null;
  conflictingRelease?: string | null;
  conflictType?: string | null;
  conflictNotes?: string | null;
  externalDependencies?: string | null;
  releaseHealth?: string | null;
  devSignoff?: string | null;
  testSignoff?: string | null;
  uatSignoff?: string | null;
  securityClearance?: string | null;
  dressRehearsal?: string | null;
  hypercarePlan?: string | null;
  commsPlan?: string | null;
  trainingStatus?: string | null;
  releaseOwnerId?: string | null;
  releaseOwner?: { id: string; userId: string; name: string; email: string; role: string } | null;
  stakeholders?: { user: { id: string; userId: string; name: string; email: string; role: string } }[];
  applications: { application: { id: string; name: string } }[];
  dependsOn: { dependsOnRelease: { id: string; releaseCode: string; name: string } }[];
  bookings: {
    id: string;
    bookingCode?: string | null;
    purpose: string | null;
    fromDate: string;
    toDate: string;
    bookedBy?: string;
    team?: string;
    application: { name: string };
  }[];
  auditEvents: { id: string; action: string; actor: string; detail: string | null; createdAt: string }[];
};

function dash(v: ReactNode) {
  if (v === null || v === undefined || v === "") return "—";
  return v;
}

function relativeLabel(iso?: string | null): string {
  if (!iso) return "—";
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (Number.isNaN(days)) return "—";
  if (days === 0) return "Today";
  if (days === 1) return "In 1 day";
  if (days > 1) return `In ${days} days`;
  if (days === -1) return "1 day ago";
  return `${Math.abs(days)} days ago`;
}

function durationLabel(start?: string | null, end?: string | null): string {
  if (!start || !end) return "—";
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "—";
  const days = Math.round((b.getTime() - a.getTime()) / 86400000);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function statusTone(status?: string | null): ChipTone {
  const normalized = (status ?? "").toLowerCase();
  if (normalized.includes("block")) return "bad";
  if (normalized.includes("risk") || normalized.includes("hold") || normalized.includes("progress")) return "warn";
  if (normalized.includes("complete") || normalized.includes("ready") || normalized.includes("approve")) return "good";
  if (normalized.includes("plan")) return "info";
  return "neutral";
}

function signalDone(value?: string | null): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return ["yes", "done", "approved", "complete", "completed", "ready", "passed", "cleared"].some(
    (token) => normalized === token || normalized.startsWith(`${token} `)
  );
}

function ConflictCodeLinks({ raw }: { raw?: string | null }) {
  const codes = (raw ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (!codes.length) return <>—</>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {codes.map((code, i) => (
        <span key={code} className="inline-flex items-center">
          {i > 0 && <span className="text-gray-400 mr-1">,</span>}
          <ProgressLink
            href={`/conflicts/${encodeURIComponent(code)}`}
            className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
          >
            {code}
          </ProgressLink>
        </span>
      ))}
    </span>
  );
}

function ReleaseCodeLinks({
  raw,
  releases,
}: {
  raw?: string | null;
  releases: { id: string; releaseCode: string }[];
}) {
  const codes = (raw ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (!codes.length) return <>—</>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {codes.map((code, i) => {
        const hit = releases.find((r) => r.releaseCode.toUpperCase() === code.toUpperCase());
        return (
          <span key={code} className="inline-flex items-center">
            {i > 0 && <span className="text-gray-400 mr-1">,</span>}
            {hit ? (
              <ProgressLink
                href={`/releases/${hit.id}`}
                className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
              >
                {code}
              </ProgressLink>
            ) : (
              <span className="font-mono text-xs">{code}</span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Live DB release detail — dashboard-first command center layout. */
export function DbReleaseDetail({ id }: { id: string }) {
  const router = useRouter();
  const [release, setRelease] = useState<ReleaseDetail | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [computedReadiness, setComputedReadiness] = useState<number | null>(null);
  const [commandRefreshKey, setCommandRefreshKey] = useState(0);
  const [blockerCount, setBlockerCount] = useState(0);
  const [topBlockerSeverity, setTopBlockerSeverity] = useState<string | null>(null);
  const [note, setNote] = useState("");
  /** Null until mount — avoids SSR/client Date mismatch on Last Refresh. */
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [lookups, setLookups] = useState<{
    departments: { id: string; name: string }[];
    applications: { id: string; name: string; departmentId: string }[];
    environments: { id: string; name: string; applicationId: string }[];
    releases: { id: string; releaseCode: string; name: string }[];
  }>({ departments: [], applications: [], environments: [], releases: [] });

  const load = useCallback(() => {
    void (async () => {
      const result = await safeFetchJson<ReleaseDetail>(`/api/releases/${id}`, { label: "release-detail" });
      setRelease(result.ok ? result.data : null);
      setLastRefresh(new Date());
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    setComputedReadiness(null);
    load();
  }, [load]);

  // Keep blocker KPI updated independently of section mount order / list refresh.
  useEffect(() => {
    if (!release?.releaseCode) return;
    return loadJsonEffect<
      { status: string; severity: string }[]
    >(`/api/blockers?release=${encodeURIComponent(release.releaseCode)}`, (rows) => {
      const open = rows.filter(
        (b) => !["resolved", "closed", "done", "mitigated", "cancelled", "canceled"].includes(b.status.toLowerCase())
      );
      const severityRank = ["Critical", "High", "Medium", "Low"];
      const top =
        open
          .map((b) => b.severity)
          .sort((a, b) => severityRank.indexOf(a) - severityRank.indexOf(b))[0] ?? null;
      setBlockerCount(open.length);
      setTopBlockerSeverity(top);
    }, { label: "release-blocker-kpi" });
  }, [release?.releaseCode]);

  useEffect(() => {
    const cleanupAuth = loadJsonEffect<{ user: SessionUser }>(
      "/api/auth/me",
      (d) => setUser(d.user),
      { label: "auth-me" }
    );
    const ac = new AbortController();
    void (async () => {
      const [deptRes, appRes, envRes, relRes] = await Promise.all([
        safeFetchJson<{ id: string; name: string }[]>("/api/departments", { signal: ac.signal, label: "departments" }),
        safeFetchJson<{ id: string; name: string; departmentId: string }[]>("/api/applications", {
          signal: ac.signal,
          label: "applications",
        }),
        safeFetchJson<{ id: string; name: string; applicationId: string }[]>("/api/environments", {
          signal: ac.signal,
          label: "environments",
        }),
        safeFetchJson<{ id: string; releaseCode: string; name: string }[]>("/api/releases", {
          signal: ac.signal,
          label: "releases",
        }),
      ]);
      if (ac.signal.aborted) return;
      setLookups({
        departments: deptRes.ok ? deptRes.data : [],
        applications: appRes.ok ? appRes.data : [],
        environments: envRes.ok ? envRes.data : [],
        releases: relRes.ok ? relRes.data : [],
      });
    })();
    return () => {
      cleanupAuth();
      ac.abort();
    };
  }, []);

  const canEdit = sessionCanEdit(user);
  const refreshCommandCenter = useCallback(() => {
    setCommandRefreshKey((key) => key + 1);
  }, []);

  const onBlockerCountChange = useCallback((count: number, topSeverity: string | null) => {
    setBlockerCount(count);
    setTopBlockerSeverity(topSeverity);
  }, []);

  const commandData = useReleaseCommandCenter({
    releaseId: id,
    refreshKey: commandRefreshKey,
    onReadinessChange: setComputedReadiness,
  });

  // Tile / next-action hash links expand the matching collapsible deep-dive.
  useEffect(() => {
    const sync = () => openDetailsFromHash(window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [release?.id]);

  const releaseOptions = useMemo(
    () =>
      [...lookups.releases].sort((a, b) => a.releaseCode.localeCompare(b.releaseCode, undefined, { numeric: true })),
    [lookups.releases]
  );

  const patchStatus = async (status: string) => {
    await safeFetchJson(`/api/releases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
      label: "release-patch-status",
    });
    load();
    refreshCommandCenter();
  };

  const recordDecision = async (detail: string) => {
    await safeFetchJson(`/api/releases/${id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decision", detail }),
      label: "release-record-decision",
    });
    load();
    refreshCommandCenter();
  };

  const addNote = async () => {
    if (!note.trim()) return;
    await safeFetchJson(`/api/releases/${id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "note", detail: note }),
      label: "release-add-note",
    });
    setNote("");
    load();
  };

  const remove = async () => {
    setDeleting(true);
    const result = await safeFetchJson(`/api/releases/${id}`, {
      method: "DELETE",
      label: "release-delete",
      rejectHttpErrors: false,
    });
    setDeleting(false);
    if (!result.ok || result.status >= 300) return;
    router.push("/releases");
  };

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading release…</p>;
  if (!release) return <p className="text-gray-500 dark:text-white/60">Release not found.</p>;

  const appNames = release.applications.map((a) => a.application.name).join(", ") || "—";
  const stakeholderIds =
    release.stakeholders?.map((s) => s.user.userId).filter(Boolean).join(", ") || "—";
  const ownerDisplay = release.releaseOwner
    ? `${release.releaseOwner.userId} (${release.releaseOwner.name})`
    : release.owner;
  const conflictFlagDisplay = release.conflictFlag
    ? release.conflictId
      ? "⚠️ CONFLICT"
      : "Yes"
    : "No";

  const headlineReadiness = pickHeadlineReadiness(computedReadiness, release.readinessPercent);
  const urgentAction = pickUrgentNextAction(commandData?.nextActions);

  const activeStage =
    commandData?.stages.find((s) => s.status === "active" || s.status === "blocked")?.label ?? "…";
  const signoffsDone = [
    release.devSignoff,
    release.testSignoff,
    release.uatSignoff,
    release.securityClearance,
    release.dressRehearsal,
  ].filter(signalDone).length;
  const shipPct = commandData?.prediction?.shipProbability;
  const slipPct = commandData?.prediction?.delayRisk;
  const daysToRelease = Math.ceil((new Date(release.releaseDate).getTime() - Date.now()) / 86400000);
  const daysToReleaseLabel =
    daysToRelease > 0 ? `${daysToRelease} day${daysToRelease === 1 ? "" : "s"}` : daysToRelease === 0 ? "Today" : "Overdue";

  // Compact "switch release" control — lives with page actions, not competing
  // with the page title for visual weight (see feedback: title is the identity).
  const releaseSwitcher = (
    <label className="flex min-w-0 items-center gap-1.5 text-sm text-gray-700 dark:text-white/80">
      <span className="hidden text-[11px] font-semibold text-slate-400 dark:text-white/45 sm:inline">
        Switch release
      </span>
      <select
        className={cn(taInput, "min-w-0 max-w-[140px] rounded-xl py-1.5 font-mono text-xs sm:max-w-[160px]")}
        value={release.id}
        onChange={(e) => {
          if (e.target.value && e.target.value !== release.id) {
            router.push(`/releases/${e.target.value}`);
          }
        }}
      >
        {releaseOptions.length === 0 ? (
          <option value={release.id}>{release.releaseCode}</option>
        ) : (
          releaseOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.releaseCode}
            </option>
          ))
        )}
      </select>
    </label>
  );

  return (
    <DetailPageShell
      entityCode={release.releaseCode}
      title={`${release.releaseCode} — ${release.name}`}
      titleClassName="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-white"
      subtitle={`Last updated ${lastRefresh ? formatDateTime(lastRefresh.toISOString()) : "—"}`}
      hideBack
      actions={
        <>
          {releaseSwitcher}
          {canEdit ? (
            <>
              <span className="mx-1 hidden h-6 w-px bg-slate-200 dark:bg-white/10 sm:inline-block" aria-hidden />
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-white/45 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete
              </button>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-indigo-200 transition-all hover:bg-indigo-700 hover:shadow-md active:scale-[0.97] dark:shadow-indigo-900/40"
              >
                <Pencil className="h-4 w-4" aria-hidden />
                Edit Release
              </button>
            </>
          ) : null}
        </>
      }
    >
      {/* Executive-style KPI tiles: Readiness / Slip / Env conflict */}
      <ReleaseSummaryBar
        headlineReadiness={headlineReadiness}
        slipRisk={slipPct ?? null}
        envConflict={Boolean(release.conflictFlag)}
      />

      <DbAIRiskPanel
        releaseId={id}
        compact
        recommendedNextStep={urgentAction?.label ?? null}
      />

      <ReleaseActionStrip
        status={release.status}
        decision={release.decision}
        canEdit={canEdit}
        onPatchStatus={patchStatus}
        onRecordDecision={recordDecision}
      />

      {/* Dashboard tiles — logical flow: ready → risks → envs → dates */}
      <div>
        <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
          Dashboard · click a tile for the full section
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ReleaseDashboardTile
            icon={Rocket}
            tone="violet"
            title="Readiness & Lifecycle"
            subtitle="Where this release is in its journey, and how likely it is to ship on the planned date."
            detail="Tracks progress from planning through to go-live. 'Current stage' is where the release sits in that journey. 'Chance of shipping on time' is a live prediction from readiness, blockers, and time remaining — different from 'Team's estimate', which is the readiness % your team typed in manually. Click through for the full breakdown."
            href="section-readiness"
            hero={{
              value: shipPct == null ? "—" : `${shipPct}%`,
              label: "Chance of shipping on time",
              hint: "Live prediction of whether this release will hit its planned go-live date. It falls when readiness is low, blockers are open, or the date is close. Different from the readiness % above.",
            }}
            metrics={[
              {
                label: "Current stage",
                value: activeStage,
                hint: "Where this release sits in the journey from Planning → Deployment. The active stage is the one the team should focus on right now.",
              },
              {
                label: "Live readiness",
                value: `${headlineReadiness}%`,
                hint: "Computed readiness from checklist items, sign-offs, and open blockers in Release Desk. 100% means every tracked prep step is done.",
              },
              {
                label: "Team's estimate",
                value: release.readinessPercent == null ? "—" : `${Math.round(release.readinessPercent)}%`,
                hint: "The readiness % your team typed in manually (planning estimate). It can differ from Live readiness, which is calculated from live signals.",
              },
              {
                label: "Prep checklist",
                value:
                  release.goLiveChecklistPercent == null ? "—" : `${Math.round(release.goLiveChecklistPercent)}%`,
                hint: "How much of the go-live checklist is complete — the practical prep work that must finish before deployment.",
              },
              {
                label: "Slip risk",
                value: slipPct == null ? "—" : `${Math.round(slipPct)}%`,
                hint: "Chance this release finishes late. Rises with open blockers, Blocked/At Risk status, or a near go-live date with low readiness. Above 40% should be reviewed.",
              },
              {
                label: "Time left",
                value: daysToReleaseLabel,
                hint: "Calendar days remaining until the planned go-live date. 'Overdue' means that date has already passed.",
              },
            ]}
          />

          <ReleaseDashboardTile
            icon={AlertTriangle}
            tone="rose"
            title="Blockers & Conflicts"
            subtitle="Open issues, environment clashes, and freeze windows that can stop this release."
            detail="Lists anything actively stopping or delaying this release — open issues (blockers), environment double-bookings, or change freeze windows that restrict when you can deploy. Resolve these before recording a Go decision. Click through to see, add, or close individual blockers."
            href="blockers"
            hero={{
              value: String(blockerCount),
              label: blockerCount === 1 ? "Open issue blocking this release" : "Open issues blocking this release",
              hint: "Count of open blocker tickets still stopping or delaying this release. Resolve these before recording a Go decision.",
            }}
            metrics={[
              {
                label: "How serious",
                value: topBlockerSeverity ?? "—",
                hint: "Highest severity among open blockers (Critical / High / Medium / Low). Critical and High usually need immediate attention.",
              },
              {
                label: "Env conflict",
                value: release.conflictFlag ? "Yes — clash detected" : "No clash",
                hint: "Whether the Test or UAT environment this release needs is already booked by another release for overlapping dates.",
              },
              {
                label: "Conflict reference",
                value: release.conflictId ?? "—",
                hint: "Conflict ticket ID (e.g. CNF-0001) linking to the full conflict record. Use it to open the conflict detail page.",
              },
              {
                label: "Conflicts with",
                value: release.conflictingRelease ?? "—",
                hint: "The other release(s) sharing the same environment window. Coordinate or reschedule one of them to clear the clash.",
              },
              {
                label: "Conflict type",
                value: release.conflictType ?? "—",
                hint: "What kind of clash this is — commonly the same Test/UAT environment required in the same dates.",
              },
              {
                label: "Change freeze",
                value: release.changeFreeze ?? "—",
                hint: "A period when production changes are restricted (e.g. quarter-end). Deployments during a freeze usually need extra approval.",
              },
            ]}
          />

          <ReleaseDashboardTile
            icon={Server}
            tone="sky"
            title="Environments & Bookings"
            subtitle="Which Test/UAT environments are needed, who booked them, and for which dates."
            detail="Shows which Test and UAT environments this release needs, who booked them, and for which dates. If another release has booked the same environment for overlapping dates, a conflict is flagged here and in the 'Env conflict' KPI above."
            href="section-environments"
            hero={{
              value: String(release.bookings.length),
              label: release.bookings.length === 1 ? "Environment booking on file" : "Environment bookings on file",
              hint: "How many environment bookings are linked to this release. Each booking reserves a Test/UAT (or similar) environment for a date range.",
            }}
            metrics={[
              {
                label: "Test environment",
                value: release.testEnvRequired ?? "—",
                hint: "The Test environment this release needs for QA. Must be free (or shared by agreement) during the test window.",
              },
              {
                label: "UAT environment",
                value: release.uatEnvRequired ?? "—",
                hint: "The User Acceptance Testing environment business users will use to sign off before go-live.",
              },
              {
                label: "Booked by",
                value:
                  [...new Set(release.bookings.map((b) => b.bookedBy).filter(Boolean))].slice(0, 2).join(", ") ||
                  "—",
                hint: "Who reserved the environment booking(s). Contact them if you need to adjust dates or share the slot.",
              },
              {
                label: "Team",
                value:
                  [...new Set(release.bookings.map((b) => b.team).filter(Boolean))].slice(0, 2).join(", ") || "—",
                hint: "Team that owns the booking — useful when you need to escalate a scheduling clash.",
              },
              {
                label: "Booking window",
                value: release.bookings[0]
                  ? `${formatDate(release.bookings[0].fromDate)} → ${formatDate(release.bookings[0].toDate)}`
                  : "—",
                hint: "Start and end dates of the first linked booking. Overlap with another release on the same env causes an env conflict.",
              },
              {
                label: "Purpose",
                value: release.bookings[0]?.purpose?.trim() || "—",
                hint: "Why the environment was booked (e.g. UAT regression, performance testing).",
              },
            ]}
          />

          <ReleaseDashboardTile
            icon={CheckCircle2}
            tone="emerald"
            title="Key Dates & Approvals"
            subtitle="CAB review, go-live date, deployment window, and required sign-offs."
            detail="Shows the Change Advisory Board (CAB) review date, the planned go-live date, and the deployment window. Also tracks the 5 required sign-offs — Dev, Test, UAT, Security, and Dress rehearsal — which should normally all be complete before recording a Go decision."
            href="section-dates"
            hero={{
              value: `${signoffsDone}/5`,
              label: "Required sign-offs approved",
              hint: "How many of the 5 required gates are done: Dev, Test, UAT, Security, and Dress rehearsal. Aim for 5/5 before recording Go.",
            }}
            metrics={[
              {
                label: "Review date (CAB)",
                value: release.cabDate ? formatDate(release.cabDate) : "—",
                hint: "Change Advisory Board review date — when the release is formally reviewed for approval to proceed.",
              },
              {
                label: "Start date",
                value: release.startDate ? formatDate(release.startDate) : "—",
                hint: "When work on this release officially started (or is planned to start).",
              },
              {
                label: "Go-live date",
                value: formatDate(release.releaseDate),
                hint: "The planned production go-live date. Slip risk and Time left are measured against this date.",
              },
              {
                label: "Deployment window",
                value: release.deploymentWindow ?? "—",
                hint: "The agreed time slot for deploying to production (e.g. Saturday night maintenance window).",
              },
              {
                label: "Approval status",
                value: release.approvalStatus ?? "—",
                hint: "Overall approval state for this release (e.g. Pending, Approved). Separate from the five individual sign-offs.",
              },
              {
                label: "Rollback plan",
                value: release.rollbackPlan ?? "—",
                hint: "Whether a plan exists to undo the deployment if something goes wrong after go-live.",
              },
            ]}
          />
        </div>
      </div>

      {/* Deep dives — open by default so current data is readable immediately */}
      <div className="space-y-3">
        <p className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
          Details · open by default · collapse any section you do not need
        </p>
        <DetailSection
          id="section-readiness"
          icon={Rocket}
          tone="violet"
          title="Readiness & Lifecycle"
          description="Live readiness score, stage progress, and ship/slip outlook"
          detail="Full breakdown of how ready this release is to ship: the live readiness score, which lifecycle stage it's currently in, and the model's ship-on-time vs. slip-risk prediction. Use this when you need the 'why' behind the numbers shown in the tile and KPI cards above."
          collapsible
          defaultOpen
        >
          {commandData ? (
            <ReadinessLifecycleContent
              data={commandData}
              storedReadiness={release.readinessPercent}
              checklistPercent={release.goLiveChecklistPercent}
            />
          ) : (
            <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
          )}
        </DetailSection>

        <DetailSection
          id="blockers"
          icon={AlertTriangle}
          tone="rose"
          title="Blockers & Conflicts"
          description="Open blockers, environment conflicts, and freeze constraints"
          detail="Everything currently blocking or threatening this release: open blocker tickets and their severity, whether the required test/UAT environment conflicts with another release's booking, and any change-freeze window that restricts deployment dates. Add or resolve blockers directly from this section."
          collapsible
          defaultOpen
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusChip
              label={release.conflictFlag ? "⚠ Conflict detected" : "No environment conflict"}
              tone={release.conflictFlag ? "bad" : "good"}
            />
            {release.changeFreeze && <StatusChip label={release.changeFreeze} tone="warn" />}
            {release.vendorMaintenance && (
              <StatusChip label={`Vendor: ${release.vendorMaintenance}`} tone="warn" />
            )}
          </div>
          <DetailFieldGrid cols={3}>
            <DetailField
              label="Conflict Flag"
              hint="Yes means another release has booked the same Test/UAT environment for overlapping dates."
              value={conflictFlagDisplay}
            />
            <DetailField
              label="Conflict ID"
              hint="Link to the conflict record (e.g. CNF-0001). Open it for resolution details."
              value={<ConflictCodeLinks raw={release.conflictId} />}
            />
            <DetailField
              label="Conflicting Release"
              hint="The other release involved in the environment clash."
              value={<ReleaseCodeLinks raw={release.conflictingRelease} releases={lookups.releases} />}
            />
            <DetailField
              label="Conflict Type"
              hint="What kind of scheduling clash this is (usually same Test/UAT environment)."
              value={dash(release.conflictType)}
            />
            <DetailField
              label="Change Freeze"
              hint="Period when production changes are restricted — deployments may need extra approval."
              value={dash(release.changeFreeze)}
            />
            <DetailField
              label="Vendor Maintenance"
              hint="Vendor-side maintenance windows that could affect testing or go-live."
              value={dash(release.vendorMaintenance)}
            />
          </DetailFieldGrid>
          {release.conflictNotes && (
            <div className="mt-3">
              <TintedCallout tone="rose">{release.conflictNotes}</TintedCallout>
            </div>
          )}
          <div className="mt-3 border-t border-gray-100 pt-3 dark:border-[var(--border)]">
            <DbBlockerList
              embedded
              releaseCode={release.releaseCode}
              releaseName={release.name}
              departmentName={release.department.name}
              applicationName={release.applications[0]?.application.name ?? ""}
              canEdit={canEdit}
              raisedByDefault={user?.name ?? ""}
              onChanged={refreshCommandCenter}
              onCountChange={onBlockerCountChange}
            />
          </div>
        </DetailSection>

        <DetailSection
          id="section-environments"
          icon={Server}
          tone="sky"
          title="Environments & Bookings"
          description="Required environments and linked booking windows"
          detail="The specific Test and UAT environments this release depends on, whether they're currently double-booked by another release, and the full list of linked environment bookings with their dates and the teams who reserved them."
          collapsible
          defaultOpen
        >
          <DetailFieldGrid cols={3}>
            <DetailField
              label="Test Env Required"
              hint="Test environment name needed for QA before UAT and go-live."
              value={dash(release.testEnvRequired)}
            />
            <DetailField
              label="UAT Env Required"
              hint="UAT environment business users will use to accept the change."
              value={dash(release.uatEnvRequired)}
            />
            <DetailField
              label="Env Conflicts"
              hint="Whether those environments overlap with another release's booking."
              value={
                <span
                  className={cn(
                    "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    release.conflictFlag
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                  )}
                >
                  {release.conflictFlag ? "Yes" : "No"}
                </span>
              }
            />
          </DetailFieldGrid>
          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-[var(--border)]">
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
              Linked environment bookings
            </p>
            {release.bookings.length ? (
              <ul className="space-y-2">
                {release.bookings.map((booking) => (
                  <li
                    key={booking.id}
                    className="rounded-xl bg-sky-50/70 px-3 py-2.5 text-sm text-slate-700 dark:bg-sky-500/10 dark:text-white/75"
                  >
                    <ProgressLink
                      href={`/booking/${booking.id}`}
                      className="font-mono text-xs font-bold text-sky-700 hover:underline dark:text-sky-300"
                    >
                      {booking.bookingCode ?? booking.id}
                    </ProgressLink>
                    {" · "}
                    <strong>{booking.application.name}</strong> · {formatDate(booking.fromDate)} →{" "}
                    {formatDate(booking.toDate)}
                    {booking.bookedBy && <span className="opacity-65"> · Booked by {booking.bookedBy}</span>}
                    {booking.team && <span className="opacity-65"> · Team {booking.team}</span>}
                    {booking.purpose && <span className="opacity-65"> · {booking.purpose}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyHint>No environment bookings are linked to this release.</EmptyHint>
            )}
          </div>
        </DetailSection>

        <DetailSection
          id="section-dates"
          icon={Calendar}
          tone="emerald"
          title="Key Dates & Approvals"
          description="CAB and go-live timeline plus sign-off and approval status"
          detail="The full release timeline — CAB review date, start date, go-live date, and deployment window — alongside every individual sign-off (Dev, Test, UAT, Security, Dress rehearsal), the overall approval status, and the rollback plan on file."
          collapsible
          defaultOpen
        >
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                Key dates & timeline
              </p>
              <div className="md:hidden">
                <DetailFieldGrid cols={2}>
                  <DetailField
                    label="CAB Date"
                    value={
                      <span>
                        {release.cabDate ? formatDate(release.cabDate) : "—"}
                        <span className="mt-0.5 block text-xs font-normal text-gray-500 dark:text-white/55">
                          {relativeLabel(release.cabDate)}
                        </span>
                      </span>
                    }
                  />
                  <DetailField
                    label="Start Date"
                    value={
                      <span>
                        {release.startDate ? formatDate(release.startDate) : "—"}
                        <span className="mt-0.5 block text-xs font-normal text-gray-500 dark:text-white/55">
                          {relativeLabel(release.startDate)}
                        </span>
                      </span>
                    }
                  />
                  <DetailField
                    label="End Date"
                    value={
                      <span>
                        {formatDate(release.releaseDate)}
                        <span className="mt-0.5 block text-xs font-normal text-gray-500 dark:text-white/55">
                          {relativeLabel(release.releaseDate)}
                        </span>
                      </span>
                    }
                  />
                  <DetailField label="Duration" value={durationLabel(release.startDate, release.releaseDate)} />
                  <DetailField label="Deploy Window" value={dash(release.deploymentWindow)} />
                </DetailFieldGrid>
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-400 dark:border-[var(--border)] dark:text-white/45">
                      <th className="py-2 pr-3 font-medium">CAB Date</th>
                      <th className="py-2 pr-3 font-medium">Start Date</th>
                      <th className="py-2 pr-3 font-medium">End Date</th>
                      <th className="py-2 pr-3 font-medium">Duration</th>
                      <th className="py-2 font-medium">Deploy Window</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-50 dark:border-[var(--border)]/60">
                      <td className="py-2 pr-3 font-medium text-gray-800 dark:text-white">
                        {release.cabDate ? formatDate(release.cabDate) : "—"}
                      </td>
                      <td className="py-2 pr-3 font-medium text-gray-800 dark:text-white">
                        {release.startDate ? formatDate(release.startDate) : "—"}
                      </td>
                      <td className="py-2 pr-3 font-medium text-gray-800 dark:text-white">
                        {formatDate(release.releaseDate)}
                      </td>
                      <td className="py-2 pr-3 font-medium text-gray-800 dark:text-white">
                        {durationLabel(release.startDate, release.releaseDate)}
                      </td>
                      <td className="py-2 font-medium text-gray-800 dark:text-white">
                        {dash(release.deploymentWindow)}
                      </td>
                    </tr>
                    <tr className="text-xs text-gray-500 dark:text-white/55">
                      <td className="py-2 pr-3">{relativeLabel(release.cabDate)}</td>
                      <td className="py-2 pr-3">{relativeLabel(release.startDate)}</td>
                      <td className="py-2 pr-3">{relativeLabel(release.releaseDate)}</td>
                      <td className="py-2 pr-3">—</td>
                      <td className="py-2">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 dark:border-[var(--border)]">
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                Sign-offs & approvals
              </p>
              <DetailFieldGrid cols={2}>
                <DetailField
                  label="Approval Status"
                  hint="Overall approval state for the release — separate from the five individual sign-off gates below."
                  value={
                    <StatusChip
                      label={String(dash(release.approvalStatus))}
                      tone={statusTone(release.approvalStatus)}
                    />
                  }
                />
                <DetailField
                  label="Rollback Plan"
                  hint="Whether a plan exists to undo the deployment if go-live fails."
                  value={
                    <StatusChip
                      label={String(dash(release.rollbackPlan))}
                      tone={statusTone(release.rollbackPlan)}
                    />
                  }
                />
              </DetailFieldGrid>
              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                <SignoffChip
                  label="Dev sign-off"
                  done={signalDone(release.devSignoff)}
                  hint="Development team confirms build quality and code readiness for release."
                />
                <SignoffChip
                  label="Test sign-off"
                  done={signalDone(release.testSignoff)}
                  hint="QA confirms testing is complete and no open P1 defects remain."
                />
                <SignoffChip
                  label="UAT sign-off"
                  done={signalDone(release.uatSignoff)}
                  hint="Business / UAT users accept the change in the UAT environment."
                />
                <SignoffChip
                  label="Security clearance"
                  done={signalDone(release.securityClearance)}
                  hint="Security / InfoSec has cleared the release for production deployment."
                />
                <SignoffChip
                  label="Dress rehearsal"
                  done={signalDone(release.dressRehearsal)}
                  hint="A practice run of the deployment (or dry-run) has been completed successfully."
                />
                <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/5">
                  <ScoreBar
                    value={release.goLiveChecklistPercent ?? 0}
                    asPercent
                    label={release.goLiveChecklistPercent == null ? "Checklist not set" : "Go-live checklist"}
                  />
                </div>
              </div>
            </div>
          </div>
        </DetailSection>
      </div>

      {/* 4. Secondary panels */}
      <div className="space-y-3">
        <p className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
          More detail
        </p>

        <DetailSection
          icon={Package}
          tone="indigo"
          title="Release Information"
          description={`${release.priority} · ${release.impact} · ${release.department.name} · ${appNames}`}
          detail="Core identifying details for this release — its ID, name, priority, business impact, owning department, and which applications it touches. Priority and Impact are usually set by the requesting team and are used to route urgent releases through Release Desk faster."
          collapsible
          defaultOpen
        >
          <DetailFieldGrid cols={3}>
            <DetailField
              label="Release ID"
              hint="Permanent code for this release (e.g. REL-0001). Used in links, bookings, and blockers."
              value={<span className="font-mono">{release.releaseCode}</span>}
            />
            <DetailField label="Release Name" hint="Short human title for this release." value={dash(release.name)} />
            <DetailField
              label="Size"
              hint="Relative size of the change (e.g. Small / Medium / Large) — helps CAB prioritize review."
              value={dash(release.releaseSize)}
            />
            <DetailField
              label="Priority"
              hint="How urgently this release should be processed (e.g. P1–P4)."
              value={dash(release.priority)}
            />
            <DetailField
              label="Impact"
              hint="Business impact if this release succeeds or is delayed (e.g. Low / Medium / High)."
              value={dash(release.impact)}
            />
            <DetailField
              label="Program / Project"
              hint="Program or project this release belongs to, for grouping related work."
              value={dash(release.programProject)}
            />
            <DetailField
              label="Department"
              hint="Owning department accountable for this release."
              value={dash(release.department.name)}
            />
            <DetailField
              label="Application"
              hint="Application(s) this release changes."
              value={appNames}
            />
            <DetailField
              label="Owner"
              hint="Person accountable for driving this release to go-live."
              value={dash(ownerDisplay)}
            />
            <DetailField
              label="External Dependencies"
              hint="Outside teams, vendors, or systems this release depends on."
              value={dash(release.externalDependencies)}
            />
            <DetailField
              label="Release Health"
              hint="Overall health signal (e.g. Go / No-Go / Caution) summarizing readiness and risk."
              value={dash(release.releaseHealth)}
            />
            <DetailField
              label="Depends On"
              hint="Other releases that must finish (or be available) before this one can proceed."
              value={
                release.dependsOn.length ? (
                  <span className="inline-flex flex-wrap gap-2">
                    {release.dependsOn.map((d) => (
                      <ProgressLink
                        key={d.dependsOnRelease.id}
                        href={`/releases/${d.dependsOnRelease.id}`}
                        className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
                      >
                        {d.dependsOnRelease.releaseCode}
                      </ProgressLink>
                    ))}
                  </span>
                ) : (
                  "—"
                )
              }
            />
          </DetailFieldGrid>
        </DetailSection>

        <DbReleaseServicesInvolved releaseId={id} />

        <DetailSection
          icon={Megaphone}
          tone="amber"
          title="Communications & Training"
          description={`Hypercare: ${release.hypercarePlan ?? "—"} · Comms: ${release.commsPlan ?? "—"} · Training: ${release.trainingStatus ?? "—"}`}
          detail="How end users and support teams will be looked after around go-live. Hypercare Plan describes extra support coverage right after release; Comms Plan describes what will be communicated and to whom; Training Status shows whether affected teams have been trained on any changes."
          collapsible
          defaultOpen
        >
          <DetailFieldGrid cols={3}>
            <DetailField
              label="Hypercare Plan"
              hint="Extra support coverage planned right after go-live to catch issues quickly."
              value={dash(release.hypercarePlan)}
            />
            <DetailField
              label="Comms Plan"
              hint="What will be communicated, to whom, and when around this release."
              value={dash(release.commsPlan)}
            />
            <DetailField
              label="Training Status"
              hint="Whether affected teams have been trained on the changes."
              value={dash(release.trainingStatus)}
            />
          </DetailFieldGrid>
        </DetailSection>

        <DetailSection
          icon={Users}
          tone="indigo"
          title="Stakeholders & Contacts"
          description={`Owner ${ownerDisplay} · Stakeholders ${stakeholderIds === "—" ? "none" : stakeholderIds} · Regulatory ${release.regulatory ?? "—"}`}
          detail="Who owns this release and who else needs to be kept in the loop, including any regulatory contact if this release touches a regulated system or process."
          collapsible
          defaultOpen
        >
          <DetailFieldGrid cols={3}>
            <DetailField
              label="Release Owner"
              hint="Primary person accountable for this release."
              value={dash(ownerDisplay)}
            />
            <DetailField
              label="Stakeholder IDs"
              hint="People who must stay informed or approve aspects of this release."
              value={<span className="font-mono text-xs">{stakeholderIds}</span>}
            />
            <DetailField
              label="Regulatory"
              hint="Regulatory or compliance contact / requirement if this release touches regulated systems."
              value={dash(release.regulatory)}
            />
          </DetailFieldGrid>
        </DetailSection>

        <DetailSection
          icon={FileText}
          tone="amber"
          title="Release Notes"
          description={release.notes ? "Notes on file" : "No additional release notes recorded"}
          detail="Free-text notes from the release owner — context, decisions, or caveats about this release that don't fit into a structured field elsewhere on this page."
          collapsible
          defaultOpen
        >
          {release.notes ? (
            <TintedCallout tone="amber">{release.notes}</TintedCallout>
          ) : (
            <EmptyHint>No additional release notes have been recorded.</EmptyHint>
          )}
        </DetailSection>

        <DetailSection
          icon={Megaphone}
          tone="violet"
          title="Stakeholder Comms"
          description="Comms Agent draft generation for stakeholder updates"
          detail="Generates a draft status update for stakeholders using AI, based on this release's current status, blockers, and readiness. Treat it as a starting point — review and edit before sending it out."
          collapsible
          defaultOpen
        >
          <StakeholderCommsPanel releaseId={id} releaseCode={release.releaseCode} />
        </DetailSection>

        <DetailSection
          id="drift"
          icon={GitCompareArrows}
          tone="sky"
          title="Release Drift"
          description="Planned vs current delivery state"
          detail="Compares what was originally planned for this release (dates, scope) against what has actually happened since. Use it to spot scope creep or schedule slippage early, before it becomes a blocker."
          collapsible
          defaultOpen
        >
          <DbReleaseDriftList releaseId={id} embedded />
        </DetailSection>

        <DetailSection
          icon={Link2}
          tone="indigo"
          title="Linked Work Items"
          description="Jira / synced delivery work linked to this release"
          detail="Jira (or other connected delivery tool) tickets linked to this release, synced automatically from your connected tools. Use this to see the underlying engineering work behind this release."
          collapsible
          defaultOpen
        >
          <DbLinkedWorkItems releaseId={id} />
        </DetailSection>

        <DetailSection
          icon={History}
          tone="violet"
          title="Audit Trail"
          description={`${release.auditEvents.length} event${release.auditEvents.length === 1 ? "" : "s"} · every edit, decision, status change, and note with who made it`}
          detail="A timestamped history of every edit, status change, Go/No-Go decision, and note on this release — each entry shows who made the change. Useful for compliance reviews and understanding how a past decision was reached."
          collapsible
          defaultOpen
        >
          <div className="space-y-3">
            {canEdit && (
              <div className="flex gap-2">
                <input
                  className={cn(taInput, "rounded-xl")}
                  placeholder="Add an audit note…"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
                <button type="button" className={taBtnSecondary} onClick={addNote}>
                  Add
                </button>
              </div>
            )}
            {release.auditEvents.length ? (
              <div className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
                {release.auditEvents.map((event) => (
                  <div
                    key={event.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-white/5"
                  >
                    <p className="min-w-0 text-slate-700 dark:text-white/80">
                      <span className="font-semibold capitalize text-slate-800 dark:text-white">
                        {event.action.replace(/_/g, " ")}
                      </span>
                      {event.detail ? (
                        <span className="text-slate-600 dark:text-white/65"> — {event.detail}</span>
                      ) : null}
                    </p>
                    <span className="shrink-0 text-right text-[10.5px] font-semibold text-indigo-600 dark:text-indigo-300">
                      {event.actor}
                    </span>
                    <span className="col-span-2 text-[10.5px] text-slate-400 dark:text-white/40">
                      {formatDateTime(event.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyHint>No audit events have been recorded for this release yet.</EmptyHint>
            )}
          </div>
        </DetailSection>
      </div>

      <p className="text-center text-[11px] text-slate-400 dark:text-white/40">
        Release Detail v3.2 · Full dashboard · Edits logged in Audit Trail
      </p>

      <ReleaseFormModal
        open={editOpen}
        initial={{
          id: release.id,
          releaseCode: release.releaseCode,
          name: release.name,
          programProject: release.programProject ?? "",
          owner: release.owner,
          status: release.status,
          releaseDate: release.releaseDate,
          priority: release.priority,
          impact: release.impact,
          departmentId: release.departmentId,
          applicationIds: release.applications.map((a) => a.application.id),
          dependsOnReleaseIds: release.dependsOn.map((d) => d.dependsOnRelease.id),
          notes: release.notes ?? "",
          releaseSize: release.releaseSize ?? "",
          cabDate: release.cabDate ?? "",
          startDate: release.startDate ?? "",
          testEnvRequired: release.testEnvRequired ?? "",
          uatEnvRequired: release.uatEnvRequired ?? "",
          releaseOwnerId: release.releaseOwner?.id ?? release.releaseOwnerId ?? "",
        }}
        existingReleaseCodes={lookups.releases.map((r) => r.releaseCode)}
        departments={lookups.departments.map((d) => ({ value: d.id, label: d.name }))}
        applications={lookups.applications.map((a) => ({
          value: a.id,
          label: a.name,
          departmentId: a.departmentId,
        }))}
        environments={lookups.environments.map((e) => ({
          value: e.name,
          label: e.name,
          applicationId: e.applicationId,
        }))}
        releases={lookups.releases.map((r) => ({
          value: r.id,
          label: r.name ? `${r.releaseCode} — ${r.name}` : r.releaseCode,
        }))}
        onClose={() => setEditOpen(false)}
        onSaved={load}
      />
      <ConfirmDeleteDialog
        open={deleteOpen}
        entityLabel="release"
        entityCode={release.releaseCode}
        busy={deleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={remove}
      />
    </DetailPageShell>
  );
}
