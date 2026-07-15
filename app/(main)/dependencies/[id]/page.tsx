"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, GitBranch, List, Package, ShieldAlert, Zap } from "lucide-react";
import {
  EditableDetailShell,
  DetailSection,
  LockedIdField,
  EditableField,
  EditableFieldGrid,
  StatusChip,
  HeroStatusRow,
  TintedCallout,
  EntityConnection,
  type ChipTone,
} from "@/components/detail/editable";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { taBtnSecondary } from "@/lib/styles";
import {
  DEPENDENCY_IMPACTS,
  DEPENDENCY_STATUSES,
  DEPENDENCY_TYPES,
} from "@/lib/validation/dependency";

type DependencyDetail = {
  id: string;
  depCode: string;
  dependencyType: string;
  status: string;
  impactIfBlocked: string;
  notes: string | null;
  release: { id: string; releaseCode: string; name: string; status: string };
  dependsOnRelease: { id: string; releaseCode: string; name: string; status: string };
};

type DependencyOption = { id: string; depCode: string };
type ReleaseOption = { id: string; releaseCode: string; name: string };

type DependencyDraft = {
  releaseId: string;
  dependsOnReleaseId: string;
  dependencyType: string;
  status: string;
  impactIfBlocked: string;
  notes: string;
};

const TYPE_OPTIONS = DEPENDENCY_TYPES.map((v) => ({ value: v, label: v }));
const STATUS_OPTIONS = DEPENDENCY_STATUSES.map((v) => ({ value: v, label: v }));
const IMPACT_OPTIONS = DEPENDENCY_IMPACTS.map((v) => ({ value: v, label: v }));

function statusTone(status: string): ChipTone {
  const s = status.toLowerCase();
  if (s.includes("block")) return "bad";
  if (s.includes("risk")) return "warn";
  if (s.includes("clear") || s.includes("resolv")) return "good";
  return "neutral";
}

function impactTone(impact: string): ChipTone {
  const s = impact.toLowerCase();
  if (s.includes("integrity") || s.includes("failure") || s.includes("critical")) return "bad";
  if (s.includes("delay") || s.includes("partial") || s.includes("scope")) return "warn";
  return "neutral";
}

function statusHeroTone(status: string): "rose" | "amber" | "emerald" | "indigo" {
  const t = statusTone(status);
  if (t === "bad") return "rose";
  if (t === "warn") return "amber";
  if (t === "good") return "emerald";
  return "indigo";
}

/** Rough clearance progress from dependency status for the hero ring. */
function statusPercent(status: string): number {
  const s = status.toLowerCase();
  if (s.includes("resolv") || s.includes("clear")) return 100;
  if (s.includes("risk")) return 45;
  if (s.includes("block")) return 15;
  return 35;
}

function withCurrentOption(
  options: { value: string; label: string }[],
  current: string | undefined
) {
  if (!current) return options;
  if (options.some((o) => o.value === current)) return options;
  return [{ value: current, label: current }, ...options];
}

function toDraft(row: DependencyDetail): DependencyDraft {
  return {
    releaseId: row.release.id,
    dependsOnReleaseId: row.dependsOnRelease.id,
    dependencyType: row.dependencyType,
    status: row.status,
    impactIfBlocked: row.impactIfBlocked,
    notes: row.notes ?? "",
  };
}

export default function DependencyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<DependencyDetail | null>(null);
  const [options, setOptions] = useState<DependencyOption[]>([]);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, list, releaseList, me] = await Promise.all([
      safeFetchJson<DependencyDetail>(`/api/dependencies/${id}`, {
        signal,
        label: "dependency-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<DependencyOption[]>("/api/dependencies", {
        signal,
        label: "dependencies-list",
      }),
      safeFetchJson<ReleaseOption[]>("/api/releases", {
        signal,
        label: "dependency-releases",
      }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal, label: "auth-me" }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(list.ok ? list.data.map((d) => ({ id: d.id, depCode: d.depCode })) : []);
    setReleases(
      releaseList.ok
        ? releaseList.data
            .map((r) => ({ id: r.id, releaseCode: r.releaseCode, name: r.name }))
            .sort((a, b) => a.releaseCode.localeCompare(b.releaseCode))
        : []
    );
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

  const selectOptions = useMemo(
    () =>
      [...options]
        .filter((o) => o.depCode)
        .sort((a, b) => a.depCode.localeCompare(b.depCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.depCode })),
    [options]
  );

  const releaseSelectOptions = useMemo(
    () =>
      releases.map((r) => ({
        value: r.id,
        label: `${r.releaseCode} — ${r.name}`,
      })),
    [releases]
  );

  const typeOptions = useMemo(
    () => withCurrentOption(TYPE_OPTIONS, row?.dependencyType),
    [row?.dependencyType]
  );
  const statusOptions = useMemo(
    () => withCurrentOption(STATUS_OPTIONS, row?.status),
    [row?.status]
  );
  const impactOptions = useMemo(
    () => withCurrentOption(IMPACT_OPTIONS, row?.impactIfBlocked),
    [row?.impactIfBlocked]
  );

  const save = async () => {
    if (!row || !edit.draft) return;
    if (edit.draft.releaseId === edit.draft.dependsOnReleaseId) {
      edit.setError("A release cannot depend on itself.");
      return;
    }
    edit.setSaving(true);
    edit.setError(null);
    const draft = edit.draft;
    const res = await safeFetchJson(`/api/dependencies/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releaseId: draft.releaseId,
        dependsOnReleaseId: draft.dependsOnReleaseId,
        dependencyType: draft.dependencyType,
        status: draft.status,
        impactIfBlocked: draft.impactIfBlocked,
        notes: draft.notes.trim() ? draft.notes.trim() : null,
      }),
      label: "dependency-patch",
      rejectHttpErrors: false,
    });
    edit.setSaving(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t save changes. Try again.");
      return;
    }
    edit.discard();
    edit.setSaveMessage("Saved");
    await load();
  };

  const remove = async () => {
    if (!row) return;
    edit.setDeleting(true);
    const res = await safeFetchJson(`/api/dependencies/${row.id}`, {
      method: "DELETE",
      label: "dependency-delete",
      rejectHttpErrors: false,
    });
    edit.setDeleting(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t delete this dependency.");
      edit.setDeleteOpen(false);
      return;
    }
    router.push("/dependencies");
  };

  if (loading) return <p className="text-slate-500 dark:text-white/60">Loading dependency…</p>;
  if (!row || !v) return <p className="text-slate-500 dark:text-white/60">Dependency not found.</p>;

  const code = row.depCode || row.id;
  const sourceRelease =
    releases.find((r) => r.id === v.releaseId) ??
    (v.releaseId === row.release.id ? row.release : null);
  const upstreamRelease =
    releases.find((r) => r.id === v.dependsOnReleaseId) ??
    (v.dependsOnReleaseId === row.dependsOnRelease.id ? row.dependsOnRelease : null);
  const blockedish = /block|risk/i.test(v.status);

  return (
    <EditableDetailShell
      pageTitle="Dependency Detail"
      pageDescription="Inter-release link that can block delivery — if the upstream release slips, impact-if-blocked spells out delay, integrity, or scope risk for the dependent."
      entityLabel="Dependency"
      entityCode={code}
      entityName={`${sourceRelease?.releaseCode ?? "—"} → ${upstreamRelease?.releaseCode ?? "—"}`}
      selectLabel="Select Dependency"
      selectValue={row.id}
      selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: code }]}
      onSelectChange={(next) => next !== row.id && router.push(`/dependencies/${next}`)}
      lastRefresh={lastRefresh}
      footer="Dependency Page v2.0 · Inter-release links · Dependency ID is locked"
      editing={edit.editing}
      canEdit={canEdit}
      saving={edit.saving}
      deleting={edit.deleting}
      saveMessage={edit.saveMessage}
      onEdit={edit.startEdit}
      onDiscard={edit.discard}
      onSave={save}
      deleteOpen={edit.deleteOpen}
      onDeleteOpen={() => edit.setDeleteOpen(true)}
      onDeleteCancel={() => edit.setDeleteOpen(false)}
      onDeleteConfirm={remove}
      relatedLinks={
        <>
          {sourceRelease && (
            <ProgressLink
              href={`/releases/${sourceRelease.id}`}
              className={taBtnSecondary + " text-sm !py-2"}
            >
              <Package className="mr-1.5 inline h-4 w-4" aria-hidden />
              Source Release
            </ProgressLink>
          )}
          {upstreamRelease && (
            <ProgressLink
              href={`/releases/${upstreamRelease.id}`}
              className={taBtnSecondary + " text-sm !py-2"}
            >
              <Package className="mr-1.5 inline h-4 w-4" aria-hidden />
              Upstream Release
            </ProgressLink>
          )}
          <ProgressLink href="/dependencies" className={taBtnSecondary + " text-sm !py-2"}>
            <List className="mr-1.5 inline h-4 w-4" aria-hidden />
            All Dependencies
          </ProgressLink>
        </>
      }
    >
      {edit.error && <TintedCallout tone="rose">{edit.error}</TintedCallout>}

      <HeroStatusRow
        hero={{
          icon: ShieldAlert,
          label: "Status",
          value: v.status,
          tone: statusHeroTone(v.status),
        }}
        secondary={{
          icon: Zap,
          label: "Type",
          value: v.dependencyType,
        }}
        metric={{
          icon: GitBranch,
          label: "Impact if blocked",
          percent: statusPercent(v.status),
          caption: v.impactIfBlocked || "impact not set",
          tone: blockedish ? "amber" : "emerald",
        }}
      />

      <DetailSection
        icon={GitBranch}
        tone="indigo"
        title="Dependency flow"
        description="Source release waits on the upstream release named on the right."
      >
        <EntityConnection
          source={
            sourceRelease ? (
              <ProgressLink
                href={`/releases/${sourceRelease.id}`}
                className="text-indigo-600 hover:underline dark:text-indigo-300"
              >
                {sourceRelease.releaseCode}
              </ProgressLink>
            ) : (
              "—"
            )
          }
          target={
            upstreamRelease ? (
              <ProgressLink
                href={`/releases/${upstreamRelease.id}`}
                className="text-sky-600 hover:underline dark:text-sky-300"
              >
                {upstreamRelease.releaseCode}
              </ProgressLink>
            ) : (
              "—"
            )
          }
          caption={`${sourceRelease?.name ?? "Source"} depends on ${upstreamRelease?.name ?? "upstream"} · ${v.dependencyType} dependency`}
        />
      </DetailSection>

      <DetailSection
        icon={Package}
        tone="sky"
        title="Linked releases"
        description="Pick which release depends on which — IDs stay stable; codes come from the release register."
      >
        <EditableFieldGrid cols={3}>
          <LockedIdField label="Dependency ID" value={code} />
          <EditableField
            label="Source Release"
            value={v.releaseId}
            editing={edit.editing}
            kind="select"
            options={releaseSelectOptions}
            onChange={(n) => edit.setField("releaseId", n)}
            display={
              sourceRelease ? (
                <ProgressLink
                  href={`/releases/${sourceRelease.id}`}
                  className="font-mono text-[13.5px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300"
                >
                  {sourceRelease.releaseCode}
                </ProgressLink>
              ) : (
                "—"
              )
            }
          />
          <EditableField
            label="Source Name"
            value={sourceRelease?.name ?? ""}
            editing={false}
            display={sourceRelease?.name ?? "—"}
          />
          <EditableField
            label="Depends On (Upstream)"
            value={v.dependsOnReleaseId}
            editing={edit.editing}
            kind="select"
            options={releaseSelectOptions}
            onChange={(n) => edit.setField("dependsOnReleaseId", n)}
            display={
              upstreamRelease ? (
                <ProgressLink
                  href={`/releases/${upstreamRelease.id}`}
                  className="font-mono text-[13.5px] font-semibold text-sky-600 hover:underline dark:text-sky-300"
                >
                  {upstreamRelease.releaseCode}
                </ProgressLink>
              ) : (
                "—"
              )
            }
          />
          <EditableField
            label="Upstream Name"
            value={upstreamRelease?.name ?? ""}
            editing={false}
            display={upstreamRelease?.name ?? "—"}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={ShieldAlert}
        tone="rose"
        title="Dependency details"
        description="Type, clearance status, and what happens if the upstream link stays blocked."
      >
        <EditableFieldGrid cols={3}>
          <EditableField
            label="Dependency Type"
            value={v.dependencyType}
            editing={edit.editing}
            kind="select"
            options={typeOptions}
            onChange={(n) => edit.setField("dependencyType", n)}
            display={<StatusChip label={v.dependencyType} tone="neutral" />}
          />
          <EditableField
            label="Status"
            value={v.status}
            editing={edit.editing}
            kind="select"
            options={statusOptions}
            onChange={(n) => edit.setField("status", n)}
            display={<StatusChip label={v.status} tone={statusTone(v.status)} />}
          />
          <EditableField
            label="Impact if Blocked"
            value={v.impactIfBlocked}
            editing={edit.editing}
            kind="select"
            options={impactOptions}
            onChange={(n) => edit.setField("impactIfBlocked", n)}
            display={<StatusChip label={v.impactIfBlocked} tone={impactTone(v.impactIfBlocked)} />}
          />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={FileText}
        tone="amber"
        title="Notes"
        description="Context for owners and CAB when this link threatens delivery."
      >
        {edit.editing ? (
          <EditableField
            label="Notes"
            value={v.notes}
            editing
            kind="textarea"
            onChange={(n) => edit.setField("notes", n)}
            placeholder="Impact context, mitigation, owners…"
          />
        ) : (
          <TintedCallout tone="amber">
            {v.notes.trim() ? v.notes : "No notes recorded yet."}
          </TintedCallout>
        )}
      </DetailSection>
    </EditableDetailShell>
  );
}
