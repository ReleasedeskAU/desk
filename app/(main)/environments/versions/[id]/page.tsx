"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, GitCompare, List, Search, Server } from "lucide-react";
import {
  EditableDetailShell,
  DetailSection,
  EditableField,
  EditableFieldGrid,
  StatusChip,
  TintedCallout,
  EntityTimeline,
  EntityConnection,
  type ChipTone,
  type TimelinePhase,
} from "@/components/detail/editable";
import { DetailDecisionHeader } from "@/components/detail/decision";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";
import {
  collectAttention,
  type DetailAction,
  type DetailFact,
} from "@/lib/detail-decision";

type VersionSibling = {
  id: string;
  version: string;
  status: string | null;
  deployDate: string | null;
  environment: { id: string; name: string; type: string };
  isCurrent: boolean;
};

type VersionDetail = {
  id: string;
  appCode: string | null;
  version: string;
  buildNumber: string | null;
  deployDate: string | null;
  updatedBy: string | null;
  status: string | null;
  notes: string | null;
  application: { id: string; name: string; department: { name: string } | null };
  environment: { id: string; name: string; type: string };
  siblings: VersionSibling[];
};

type VersionListRow = {
  id: string;
  appCode: string | null;
  version?: string | null;
  environment?: { name?: string };
};

type DeskPayload = { versions?: VersionListRow[] };

type VersionDraft = {
  version: string;
  buildNumber: string;
  deployDate: string;
  updatedBy: string;
  status: string;
  notes: string;
};

const VERSION_FIELD_LABELS: Partial<Record<keyof VersionDraft, string>> = {
  version: "Version",
  buildNumber: "Build Number",
  deployDate: "Deploy Date",
  updatedBy: "Updated By",
  status: "Status",
  notes: "Notes",
};

/** Canonical promotion stages for the progression timeline. */
const PROGRESSION_STAGES = [
  {
    label: "Dev",
    match: (n: string) => /\bdev\b|development/.test(n),
  },
  {
    label: "Test",
    match: (n: string) => /\btest\b|qa\b/.test(n) && !/uat|pre-?prod|preprod/.test(n),
  },
  {
    label: "UAT",
    match: (n: string) => /\buat\b/.test(n),
  },
  {
    label: "Pre-Prod",
    match: (n: string) => /pre-?prod|preprod|staging/.test(n),
  },
  {
    label: "Prod",
    match: (n: string) => /\bprod\b|production/.test(n),
  },
] as const;

function toDateInput(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function nullIfEmpty(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

type Alignment = {
  label: string;
  tone: ChipTone;
  /** Machine-readable verdict; `label` may be raw free-text from the record. */
  state: "drift" | "sync" | "unknown" | "other";
  caption: string;
};

function alignmentFromStatus(status: string | null | undefined): Alignment {
  const s = (status ?? "").toLowerCase();
  if (s.includes("behind") || s.includes("drift") || s.includes("outdated")) {
    return { label: "Drift", tone: "bad", state: "drift", caption: "behind other stages" };
  }
  if (s.includes("current") || s.includes("sync") || s.includes("in sync")) {
    return { label: "In Sync", tone: "good", state: "sync", caption: "aligned with promotion path" };
  }
  if (!status?.trim()) {
    return { label: "Unknown", tone: "neutral", state: "unknown", caption: "status not recorded" };
  }
  return { label: status, tone: "neutral", state: "other", caption: "check before promotion" };
}

/** A build sitting this long without promotion is stale against later stages. */
const STALE_BUILD_DAYS = 90;

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function statusTone(status: string): ChipTone {
  return alignmentFromStatus(status).tone;
}

/**
 * Maps Dev → Prod stages onto sibling version rows by environment name/type.
 * Complete when a version exists for that stage; active when it is the viewed row.
 */
function buildProgressionPhases(siblings: VersionSibling[]): TimelinePhase[] {
  return PROGRESSION_STAGES.map((stage) => {
    const match = siblings.find((s) => {
      const haystack = `${s.environment.name} ${s.environment.type}`.toLowerCase();
      return stage.match(haystack);
    });
    const hasVersion = Boolean(match?.version?.trim());
    return {
      label: stage.label,
      detail: match?.version?.trim()
        ? match.version
        : match
          ? "No version"
          : "Not deployed",
      complete: hasVersion && !match?.isCurrent,
      active: Boolean(match?.isCurrent),
      tone: match?.isCurrent ? "sky" : hasVersion ? "emerald" : "amber",
    };
  });
}

function toDraft(row: VersionDetail): VersionDraft {
  return {
    version: row.version ?? "",
    buildNumber: row.buildNumber ?? "",
    deployDate: toDateInput(row.deployDate),
    updatedBy: row.updatedBy ?? "",
    status: row.status ?? "",
    notes: row.notes ?? "",
  };
}

export default function VersionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<VersionDetail | null>(null);
  const [options, setOptions] = useState<VersionListRow[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, desk, me] = await Promise.all([
      safeFetchJson<VersionDetail>(`/api/environment-versions/${id}`, {
        signal,
        label: "version-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<DeskPayload>("/api/environment-desk", {
        signal,
        label: "versions-list",
      }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal, label: "auth-me" }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(desk.ok && desk.data.versions ? desk.data.versions : []);
    if (me.ok) setUser(me.data.user);
    setLastRefresh(new Date());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const source = useMemo(() => (row ? toDraft(row) : null), [row]);
  const edit = useEditableDetail(source);
  const canEdit = sessionCanEdit(user);
  const v = edit.values;
  const d = edit.draft;

  const selectOptions = useMemo(() => {
    const mapped = options
      .filter((o) => o.id)
      .map((o) => ({
        value: o.id,
        label: o.appCode
          ? `${o.appCode}${o.version ? ` · ${o.version}` : ""}${
              o.environment?.name ? ` · ${o.environment.name}` : ""
            }`
          : `${o.id}${o.version ? ` · ${o.version}` : ""}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    if (row && !mapped.some((o) => o.value === row.id)) {
      const code = row.appCode ?? row.id;
      mapped.unshift({
        value: row.id,
        label: `${code}${row.version ? ` · ${row.version}` : ""} · ${row.environment.name}`,
      });
    }
    return mapped;
  }, [options, row]);

  const save = async () => {
    if (!row || !edit.draft) return;
    edit.setSaving(true);
    edit.setError(null);
    const d = edit.draft;
    // Identity fields (id, appCode) must never be sent — schema.strict rejects them.
    const res = await safeFetchJson(`/api/environment-versions/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: d.version.trim(),
        buildNumber: nullIfEmpty(d.buildNumber),
        deployDate: nullIfEmpty(d.deployDate),
        updatedBy: nullIfEmpty(d.updatedBy),
        status: nullIfEmpty(d.status),
        notes: nullIfEmpty(d.notes),
      }),
      label: "version-patch",
      rejectHttpErrors: false,
    });
    edit.setSaving(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t save changes. Try again.");
      return;
    }
    edit.completeSaveSuccess(VERSION_FIELD_LABELS);
    await load();
  };

  const remove = async () => {
    if (!row) return;
    edit.setDeleting(true);
    const res = await safeFetchJson(`/api/environment-versions/${row.id}`, {
      method: "DELETE",
      label: "version-delete",
      rejectHttpErrors: false,
    });
    edit.setDeleting(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t delete this version.");
      edit.setDeleteOpen(false);
      return;
    }
    // List lives under /environments (no /environments/versions index).
    router.push("/environments");
  };

  if (loading) return <p className="text-slate-500 dark:text-white/60">Loading version…</p>;
  if (!row || !v) return <p className="text-slate-500 dark:text-white/60">Version not found.</p>;

  const versionCode = row.appCode ?? row.id;
  const alignment = alignmentFromStatus(v.status);
  const phases = buildProgressionPhases(row.siblings ?? []);
  const stagesWithVersion = phases.filter((p) => p.complete || p.active).length;
  const versionLabel = v.version.trim();
  const deployAge = v.deployDate ? daysSince(v.deployDate) : null;

  const attention = collectAttention([
    {
      id: "drift",
      when: alignment.state === "drift",
      tone: "critical",
      label: `${row.environment.name} is behind the promotion path`,
      detail: "Testing done here no longer reflects what later stages will run.",
    },
    {
      id: "no-version",
      when: !versionLabel,
      tone: "critical",
      label: "No version recorded",
      detail: "Nothing identifies which build this environment is running.",
    },
    {
      id: "unknown-alignment",
      when: alignment.state === "unknown" && Boolean(versionLabel),
      tone: "warning",
      label: "Alignment status not recorded",
      detail: "Nobody has confirmed whether this stage is current or behind.",
    },
    {
      id: "no-deploy-date",
      when: !v.deployDate,
      tone: "warning",
      label: "No deploy date",
      detail: "Without a deploy date the build cannot be aged against other stages.",
    },
    {
      id: "stale-build",
      when: deployAge != null && deployAge > STALE_BUILD_DAYS && alignment.state !== "sync",
      tone: "warning",
      label: `Deployed ${deployAge} days ago`,
    },
    {
      id: "no-trail",
      when: stagesWithVersion <= 1,
      tone: "warning",
      label: "No promotion trail",
      detail: "Only this stage has a recorded version, so drift cannot be compared.",
    },
  ]);

  const signals: DetailFact[] = [
    { label: "Version", value: versionLabel || "—", tone: versionLabel ? "neutral" : "bad" },
    { label: "Build", value: v.buildNumber.trim() || "—" },
    {
      label: "Stages",
      value: `${stagesWithVersion}/${phases.length}`,
      tone: stagesWithVersion <= 1 ? "warn" : "neutral",
      hint: "Promotion stages with a recorded version.",
    },
  ];

  const timing: DetailFact[] = [
    {
      label: "Deployed",
      value: v.deployDate ? formatDate(v.deployDate) : "Not recorded",
      tone: v.deployDate ? "neutral" : "warn",
      hint: deployAge != null ? `${deployAge} day${deployAge === 1 ? "" : "s"} ago` : undefined,
    },
    { label: "Updated by", value: v.updatedBy.trim() || "—" },
  ];

  const scope: DetailFact[] = [
    { label: "Application", value: row.application.name },
    { label: "Environment", value: `${row.environment.name} (${row.environment.type})` },
    { label: "Department", value: row.application.department?.name ?? "—" },
  ];

  // No status to advance — the useful next step is comparing against the drift
  // register when this stage is out of line.
  const primaryAction: DetailAction | null =
    alignment.state === "drift"
      ? {
          id: "check-drift",
          label: "Check drift records",
          href: "/drifts",
          hint: "See whether this gap is already logged as a drift.",
        }
      : null;

  return (
    <EditableDetailShell
      pageTitle="Version Detail"
      pageDescription="Deployed build for one application environment — version/status vs other stages shows promotion drift before go-live."
      entityLabel="Version"
      entityCode={versionCode}
      entityName={`${row.application.name} · ${v.version || row.version}`}
      selectLabel="Select Version"
      selectValue={row.id}
      selectOptions={selectOptions}
      onSelectChange={(next) => next !== row.id && router.push(`/environments/versions/${next}`)}
      lastRefresh={lastRefresh}
      footer="Version Page v2.0 · Environment versions · Version ID is locked"
      editing={edit.editing}
      canEdit={canEdit}
      saving={edit.saving}
      deleting={edit.deleting}
      editError={edit.error}
      onClearEditError={() => edit.setError(null)}
      onEdit={edit.startEdit}
      onDiscard={edit.discard}
      onSave={save}
      deleteOpen={edit.deleteOpen}
      onDeleteOpen={() => edit.setDeleteOpen(true)}
      onDeleteCancel={() => edit.setDeleteOpen(false)}
      onDeleteConfirm={remove}
      lockedIdLabel="Version ID"
      successChanges={edit.successChanges}
      onSuccessDismiss={edit.dismissSuccess}
      editForm={
        d ? (
          <EditableFieldGrid cols={2}>
            <EditableField
              label="Version"
              value={d.version}
              editing
              mono
              onChange={(n) => edit.setField("version", n)}
              placeholder="e.g. 1.2.3"
            />
            <EditableField
              label="Status"
              value={d.status}
              editing
              onChange={(n) => edit.setField("status", n)}
              display={
                d.status.trim() ? (
                  <StatusChip label={d.status} tone={statusTone(d.status)} />
                ) : (
                  "—"
                )
              }
              placeholder="e.g. Current, Behind…"
            />
            <EditableField
              label="Build Number"
              value={d.buildNumber}
              editing
              mono
              onChange={(n) => edit.setField("buildNumber", n)}
              placeholder="Build #"
            />
            <EditableField
              label="Deploy Date"
              value={d.deployDate}
              editing
              kind="date"
              onChange={(n) => edit.setField("deployDate", n)}
              display={d.deployDate ? formatDate(d.deployDate) : "—"}
            />
            <EditableField
              label="Updated By"
              value={d.updatedBy}
              editing
              onChange={(n) => edit.setField("updatedBy", n)}
              placeholder="Deployer name…"
            />
            <EditableField
              label="Notes"
              value={d.notes}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("notes", n)}
              placeholder="Promotion notes…"
              className="sm:col-span-2"
            />
          </EditableFieldGrid>
        ) : null
      }
      relatedLinks={
        <>
          <ProgressLink href="/environments" className={taBtnSecondary + " text-sm !py-2"}>
            <GitCompare className="mr-1.5 inline h-4 w-4" aria-hidden />
            Compare Versions
          </ProgressLink>
          <ProgressLink href="/drifts" className={taBtnSecondary + " text-sm !py-2"}>
            <Search className="mr-1.5 inline h-4 w-4" aria-hidden />
            View Drift
          </ProgressLink>
          <ProgressLink href="/environments" className={taBtnSecondary + " text-sm !py-2"}>
            <List className="mr-1.5 inline h-4 w-4" aria-hidden />
            All Environments
          </ProgressLink>
        </>
      }
    >
      <DetailDecisionHeader
        status={{ label: alignment.label, tone: alignment.tone, caption: alignment.caption }}
        signals={signals}
        primaryAction={primaryAction}
        canEdit={canEdit}
        attention={attention}
        attentionClearLabel="Build is in sync with the promotion path"
        timing={timing}
        scope={scope}
      />

      <DetailSection
        icon={Server}
        tone="sky"
        title="Promotion path"
        description={`Where this build sits across Dev → Prod (${stagesWithVersion} of ${phases.length} stages have a version).`}
      >
        <EntityTimeline phases={phases} />
        <div className="mt-4">
          <EntityConnection
            source={row.application.name}
            target={`${row.environment.name} · ${v.version || row.version}`}
            caption={`Build ${v.buildNumber.trim() || "not recorded"} · deployed ${
              v.deployDate ? formatDate(v.deployDate) : "date not recorded"
            }`}
          />
        </div>
      </DetailSection>

      <DetailSection
        icon={FileText}
        tone="amber"
        title="Notes"
        description="Context for promotion decisions, known gaps, or rollback hints."
      >
        <TintedCallout tone="amber">
          {v.notes.trim() ? v.notes : "No notes recorded yet."}
        </TintedCallout>
      </DetailSection>
    </EditableDetailShell>
  );
}
