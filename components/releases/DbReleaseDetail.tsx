"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import {
  ConfirmDeleteDialog,
  DetailSection,
  EmptyHint,
  SignoffChip,
  StatusChip,
  TintedCallout,
  type ChipTone,
} from "@/components/detail/editable";
import {
  ReadinessLifecycleContent,
  useReleaseCommandCenter,
} from "@/components/releases/DbReleaseCommandCenter";
import { DetailDecisionHeader } from "@/components/detail/decision";
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
import { openDetailsFromHash, pickHeadlineReadiness } from "@/lib/release-detail-layout";
import { formatStakeholderNames } from "@/lib/release-stakeholder-display";
import {
  collectAttention,
  describeDue,
  dueTone,
  type DetailFact,
} from "@/lib/detail-decision";
import type { ReleaseLifecycleStatusKind } from "@/lib/release-lifecycle-config";
import { toneForLifecycleKind } from "@/lib/release-lifecycle-status-ui";
import { findEntityStatusByLabel } from "@/lib/entity-lifecycle-status-ui";
import type { SignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config";
import {
  AlertTriangle,
  Calendar,
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
  businessSignoff?: string | null;
  opsSignoff?: string | null;
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

/** Readiness at or above this percentage reads as healthy in the decision header. */
const READY_READINESS_PERCENT = 80;
/** Below this, prep work is treated as a live risk rather than routine progress. */
const LOW_READINESS_PERCENT = 50;
/** Slip probability at or above this warrants a review before go-live. */
const HIGH_SLIP_RISK_PERCENT = 40;

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

/** Heuristic tone for non-lifecycle fields (approval, rollback, etc.). */
function fieldStatusTone(status?: string | null): ChipTone {
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

/** Prefer sign-off lifecycle `countsAsComplete`; fall back to heuristic. */
function signoffComplete(
  value: string | null | undefined,
  signoffConfig: SignoffLifecycleConfig | null
): boolean {
  if (!value?.trim()) return false;
  if (!signoffConfig) return signalDone(value);
  const found = findEntityStatusByLabel(signoffConfig, value);
  if (!found) return signalDone(value);
  return Boolean(
    (found as { countsAsComplete?: boolean }).countsAsComplete
  );
}

/**
 * Split a comma-separated code list and drop case-insensitive duplicates
 * (seed/CSV often repeats the same REL-/CNF- code).
 * @param raw - Comma-separated codes.
 */
function uniqueCodes(raw?: string | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const code = part.trim();
    if (!code) continue;
    const key = code.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(code);
  }
  return out;
}

function ConflictCodeLinks({ raw }: { raw?: string | null }) {
  const codes = uniqueCodes(raw);
  if (!codes.length) return <>—</>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {codes.map((code, i) => (
        <span key={code.toUpperCase()} className="inline-flex items-center">
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
  const codes = uniqueCodes(raw);
  if (!codes.length) return <>—</>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {codes.map((code, i) => {
        const hit = releases.find((r) => r.releaseCode.toUpperCase() === code.toUpperCase());
        return (
          <span key={code.toUpperCase()} className="inline-flex items-center">
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
  const [lifecycleStatus, setLifecycleStatus] = useState<{
    label: string;
    kind: ReleaseLifecycleStatusKind | null;
    enabled: boolean;
  } | null>(null);
  const [signoffConfig, setSignoffConfig] =
    useState<SignoffLifecycleConfig | null>(null);

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

  useEffect(() => {
    if (!release?.id) return;
    return loadJsonEffect<{
      currentLabel: string;
      currentKind: ReleaseLifecycleStatusKind | null;
      currentEnabled: boolean;
    }>(
      `/api/releases/${release.id}/lifecycle`,
      (payload) =>
        setLifecycleStatus({
          label: payload.currentLabel,
          kind: payload.currentKind ?? null,
          enabled: payload.currentEnabled,
        }),
      { label: "release-detail-lifecycle-status" }
    );
  }, [release?.id, release?.status, commandRefreshKey]);

  useEffect(() => {
    return loadJsonEffect<{ config: SignoffLifecycleConfig }>(
      "/api/signoff-lifecycle-config",
      (payload) => setSignoffConfig(payload.config),
      { label: "release-detail-signoff-lifecycle" }
    );
  }, []);

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
  const stakeholderNames = formatStakeholderNames(release.stakeholders);
  const ownerDisplay = release.releaseOwner
    ? `${release.releaseOwner.userId} (${release.releaseOwner.name})`
    : release.owner;
  const conflictFlagDisplay = release.conflictFlag
    ? release.conflictId
      ? "⚠️ CONFLICT"
      : "Yes"
    : "No";

  const headlineReadiness = pickHeadlineReadiness(computedReadiness, release.readinessPercent);

  const activeStage =
    commandData?.stages.find((s) => s.status === "active" || s.status === "blocked")?.label ?? "…";
  const signoffsDone = [
    release.devSignoff,
    release.testSignoff,
    release.uatSignoff,
    release.securityClearance,
    release.businessSignoff,
    release.opsSignoff,
    release.dressRehearsal,
  ].filter((v) => signoffComplete(v, signoffConfig)).length;
  const shipPct = commandData?.prediction?.shipProbability;
  const slipPct = commandData?.prediction?.delayRisk;
  const releaseDue = describeDue(release.releaseDate);
  const cabDue = describeDue(release.cabDate);
  // A shipped or cancelled release cannot be "overdue" — suppress that alarm.
  const releaseSettled = /complete|closed|deployed|cancel/i.test(release.status ?? "");

  // Attention = what's stuck. Signals = scores. Never put the same metric in both.
  const decisionAttention = collectAttention([
    {
      id: "blockers",
      when: blockerCount > 0,
      tone: topBlockerSeverity === "Critical" || topBlockerSeverity === "High" ? "critical" : "warning",
      label: `${blockerCount} open blocker${blockerCount === 1 ? "" : "s"}${
        topBlockerSeverity ? ` · top ${topBlockerSeverity}` : ""
      }`,
      detail: "Open blockers must be resolved or formally accepted before this release can ship.",
      href: "#blockers",
    },
    {
      id: "conflict",
      when: Boolean(release.conflictFlag),
      tone: "critical",
      label: release.conflictingRelease
        ? `Environment conflict with ${release.conflictingRelease}`
        : "Environment conflict",
      detail: "Another release has booked the same environment for an overlapping window.",
      href: "#blockers",
    },
    {
      id: "overdue",
      when: releaseDue.state === "overdue" && !releaseSettled,
      tone: "critical",
      label: `Go-live ${releaseDue.label.toLowerCase()}`,
      detail: "The planned production date has passed and this release is not yet complete.",
      href: "#section-dates",
    },
    {
      id: "freeze",
      when: Boolean(release.changeFreeze?.trim()),
      tone: "warning",
      label: `Change freeze: ${release.changeFreeze}`,
      detail: "Deployment dates are restricted while the freeze window applies.",
      href: "#blockers",
    },
  ]);

  const decisionSignals: DetailFact[] = [
    {
      label: "Readiness",
      value: `${headlineReadiness}%`,
      tone: headlineReadiness >= READY_READINESS_PERCENT ? "good" : headlineReadiness >= LOW_READINESS_PERCENT ? "warn" : "bad",
      hint: "Live readiness from completed checklist items, sign-offs and open blockers recorded in Release Desk.",
      href: "#section-readiness",
    },
    {
      label: "Slip risk",
      value: slipPct == null ? "—" : `${Math.round(slipPct)}%`,
      tone: slipPct == null ? "neutral" : slipPct >= HIGH_SLIP_RISK_PERCENT ? "bad" : "good",
      hint: "Chance this release misses its planned go-live date, based on blockers, status and time remaining.",
      href: "#section-readiness",
    },
    {
      label: "Ship chance",
      value: shipPct == null ? "—" : `${Math.round(shipPct)}%`,
      tone: shipPct == null ? "neutral" : shipPct >= READY_READINESS_PERCENT ? "good" : shipPct >= LOW_READINESS_PERCENT ? "warn" : "bad",
      hint: "Live prediction of shipping on the planned go-live date from readiness, blockers and time left.",
      href: "#section-readiness",
    },
    {
      label: "Sign-offs",
      value: `${signoffsDone}/5`,
      tone: signoffsDone >= 5 ? "good" : signoffsDone >= 3 ? "warn" : "bad",
      hint: "Required gates: Tech Review, QA (Test + UAT), Security Review, Dress rehearsal.",
      href: "#section-dates",
    },
  ];

  // Go-live hint already carries overdue copy — no separate Time left row.
  const decisionTiming: DetailFact[] = [
    {
      label: "Go-live",
      value: formatDate(release.releaseDate),
      tone: releaseSettled ? "neutral" : dueTone(releaseDue.state),
      hint: releaseDue.label,
    },
    {
      label: "CAB",
      value: release.cabDate ? formatDate(release.cabDate) : "—",
      tone: releaseSettled ? "neutral" : dueTone(cabDue.state),
      hint: cabDue.label,
    },
    { label: "Window", value: release.deploymentWindow || "—" },
  ];

  const dependsOnCodes = release.dependsOn.map((d) => d.dependsOnRelease.releaseCode);
  const decisionScope: DetailFact[] = [
    { label: "Applications", value: appNames },
    {
      label: "Environments",
      value: [release.testEnvRequired, release.uatEnvRequired].filter(Boolean).join(" · ") || "—",
      href: "#section-environments",
    },
    {
      label: "Depends on",
      value: dependsOnCodes.length ? dependsOnCodes.join(", ") : "None",
      href: dependsOnCodes.length ? `/releases/${release.id}/dependencies` : undefined,
    },
    { label: "Department", value: release.department.name },
  ];

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

  const headerStatusLabel = lifecycleStatus?.label ?? release.status;
  // Match decision-header colors: interrupt/risk → rose, branch → amber,
  // shipped/closed → emerald, mainline → indigo; cancelled stays neutral.
  const headerStatusTone = ((): ChipTone => {
    const label = headerStatusLabel.toLocaleLowerCase();
    if (label.includes("cancel")) return "neutral";
    if (lifecycleStatus?.kind === "interrupt" || label.includes("block")) return "bad";
    if (
      lifecycleStatus?.kind === "branch" ||
      label.includes("risk") ||
      label.includes("defer") ||
      label.includes("reject") ||
      label.includes("roll")
    ) {
      return "warn";
    }
    return toneForLifecycleKind(lifecycleStatus?.kind ?? null) as ChipTone;
  })();

  return (
    <DetailPageShell
      entityCode={release.releaseCode}
      title={`${release.releaseCode} — ${release.name}`}
      titleClassName="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-white"
      subtitle={`Last updated ${lastRefresh ? formatDateTime(lastRefresh.toISOString()) : "—"}`}
      hideBack
      actions={
        <>
          <span data-testid="release-detail-header-status">
            <StatusChip
              label={headerStatusLabel}
              tone={headerStatusTone}
              className="shrink-0 px-3.5 py-1.5 text-[12px] font-bold tracking-wide"
            />
          </span>
          {lifecycleStatus && !lifecycleStatus.enabled ? (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 dark:bg-rose-500/20 dark:text-rose-200">
              Off
            </span>
          ) : null}
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
      {/* 1. Verdict — can I ship, or what's stuck? */}
      <DetailDecisionHeader
        identity={[
          { label: "Owner", value: ownerDisplay },
          { label: "Program", value: release.programProject || "—" },
          { label: "Priority", value: release.priority },
        ]}
        status={{
          label: lifecycleStatus?.label ?? release.status,
          tone: toneForLifecycleKind(lifecycleStatus?.kind ?? null) as ChipTone,
          caption: release.decision
            ? `Decision: ${release.decision}`
            : lifecycleStatus && !lifecycleStatus.enabled
              ? "Off in lifecycle settings"
              : `Stage: ${activeStage}`,
        }}
        signals={decisionSignals}
        canEdit={canEdit}
        attention={decisionAttention}
        attentionClearLabel="No blockers, conflicts or overdue gates on this release"
        timing={decisionTiming}
        scope={decisionScope}
      />

      {/* 2–5. Critical workspace in RM order: clear blockers → prove readiness →
          clear gates → confirm environments. No dashboard tiles — they repeated
          the header scores. */}
      <div className="space-y-3">
        <p className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
          Critical path
        </p>

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
          id="section-readiness"
          icon={Rocket}
          tone="violet"
          title="Readiness & Lifecycle"
          description="Stage progress and the breakdown behind the readiness / ship / slip scores"
          detail="Why the header scores look the way they do — lifecycle stage, checklist, and prediction inputs. Numbers themselves live only in the decision header."
          collapsible
          defaultOpen
        >
          {commandData ? (
            <ReadinessLifecycleContent
              releaseId={id}
              data={commandData}
              storedReadiness={release.readinessPercent}
              checklistPercent={release.goLiveChecklistPercent}
              refreshKey={commandRefreshKey}
              breakdownOnly
            />
          ) : (
            <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
          )}
        </DetailSection>

        <DetailSection
          id="section-dates"
          icon={Calendar}
          tone="emerald"
          title="Sign-offs & Approvals"
          description="Required gates and approval state — go-live / CAB / window are in the header"
          detail="Individual sign-offs (Tech Review, QA Test/UAT, Security Review, Dress rehearsal), overall approval status, and rollback plan. Calendar dates already shown in the decision header are not repeated here."
          collapsible
          defaultOpen
        >
          <div className="space-y-5">
            <DetailFieldGrid cols={2}>
              <DetailField
                label="Start Date"
                hint="When work on this release officially started (or is planned to start)."
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
                label="Duration"
                hint="Calendar span from start to planned go-live."
                value={durationLabel(release.startDate, release.releaseDate)}
              />
            </DetailFieldGrid>

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
                      tone={fieldStatusTone(release.approvalStatus)}
                    />
                  }
                />
                <DetailField
                  label="Rollback Plan"
                  hint="Whether a plan exists to undo the deployment if go-live fails."
                  value={
                    <StatusChip
                      label={String(dash(release.rollbackPlan))}
                      tone={fieldStatusTone(release.rollbackPlan)}
                    />
                  }
                />
              </DetailFieldGrid>
              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                <SignoffChip
                  label="Tech Review"
                  done={signoffComplete(release.devSignoff, signoffConfig)}
                  hint="Development team confirms build quality and code readiness for release."
                />
                <SignoffChip
                  label="QA Sign-Off — Test Phase"
                  done={signoffComplete(release.testSignoff, signoffConfig)}
                  hint="QA confirms testing is complete and no open P1 defects remain."
                />
                <SignoffChip
                  label="QA Sign-Off — UAT Phase"
                  done={signoffComplete(release.uatSignoff, signoffConfig)}
                  hint="Business / UAT users accept the change in the UAT environment."
                />
                <SignoffChip
                  label="Security Review"
                  done={signoffComplete(release.securityClearance, signoffConfig)}
                  hint="Security / InfoSec has cleared the release for production deployment."
                />
                <SignoffChip
                  label="Business Review"
                  done={signoffComplete(release.businessSignoff, signoffConfig)}
                  hint="Business review of scope, impact, and go-live readiness."
                />
                <SignoffChip
                  label="Operations Review"
                  done={signoffComplete(release.opsSignoff, signoffConfig)}
                  hint="Operations confirms runbooks, monitoring, and support are ready."
                />
                <SignoffChip
                  label="Dress rehearsal"
                  done={signoffComplete(release.dressRehearsal, signoffConfig)}
                  hint="A practice run of the deployment (or dry-run) has been completed successfully."
                />
              </div>
            </div>
          </div>
        </DetailSection>

        <DetailSection
          id="section-environments"
          icon={Server}
          tone="sky"
          title="Environment Bookings"
          description="Linked booking windows — required env names are in the header scope"
          detail="Booking rows that reserve Test/UAT (or similar) for this release. Required environment names and conflict status are already in the decision header / Blockers section."
          collapsible
          defaultOpen
        >
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
        </DetailSection>
      </div>

      <ReleaseActionStrip
        releaseId={id}
        status={release.status}
        decision={release.decision}
        canEdit={canEdit}
        refreshKey={commandRefreshKey}
        onStatusChanged={() => {
          load();
          refreshCommandCenter();
        }}
        onRecordDecision={recordDecision}
      />

      <DbAIRiskPanel releaseId={id} compact />

      {/* Supporting detail — open by default; collapse any section you do not need. */}
      <div className="space-y-3">
        <p className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
          More detail · open by default · collapse any section you do not need
        </p>

        <DetailSection
          icon={Package}
          tone="indigo"
          title="Release Information"
          description={`${release.releaseSize ?? "Size n/a"} · ${release.impact} · health ${release.releaseHealth ?? "—"}`}
          detail="Fields not already shown in the decision header — size, impact, health and external dependencies."
          collapsible
          defaultOpen
        >
          <DetailFieldGrid cols={3}>
            <DetailField
              label="Size"
              hint="Relative size of the change (e.g. Small / Medium / Large) — helps CAB prioritize review."
              value={dash(release.releaseSize)}
            />
            <DetailField
              label="Impact"
              hint="Business impact if this release succeeds or is delayed (e.g. Low / Medium / High)."
              value={dash(release.impact)}
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
          description={`Stakeholders ${stakeholderNames === "—" ? "none" : stakeholderNames} · Regulatory ${release.regulatory ?? "—"}`}
          detail="Who else needs to be kept in the loop. Owner is already shown in the decision header."
          collapsible
          defaultOpen
        >
          <DetailFieldGrid cols={2}>
            <DetailField
              label="Stakeholders"
              hint="People who must stay informed or approve aspects of this release."
              value={stakeholderNames}
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
          approvalStatus: release.approvalStatus ?? "",
          rollbackPlan: release.rollbackPlan ?? "",
          hypercarePlan: release.hypercarePlan ?? "",
          commsPlan: release.commsPlan ?? "",
          trainingStatus: release.trainingStatus ?? "",
          stakeholderIds: (release.stakeholders ?? []).map((s) => s.user.id),
          devSignoff: release.devSignoff ?? "",
          testSignoff: release.testSignoff ?? "",
          uatSignoff: release.uatSignoff ?? "",
          securityClearance: release.securityClearance ?? "",
          businessSignoff: release.businessSignoff ?? "",
          opsSignoff: release.opsSignoff ?? "",
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
