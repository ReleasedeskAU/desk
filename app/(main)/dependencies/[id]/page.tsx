"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MockupDetailChrome,
  MockupSection,
  GlanceStrip,
  DetailField,
  DetailFieldGrid,
  dash,
} from "@/components/detail/MockupDetailChrome";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { DependencyFormModal } from "@/components/dependencies/DependencyFormModal";
import { safeFetchJson, loadJsonEffect } from "@/lib/safe-fetch";
import { canEdit as sessionCanEdit, type SessionUser } from "@/lib/auth/roles";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { LayoutDashboard, List, Package, Pencil, Trash2 } from "lucide-react";
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

function impactTone(impact: string): "bad" | "warn" | "neutral" | "good" {
  const s = impact.toLowerCase();
  if (s.includes("critical") || s.includes("high") || s.includes("integrity") || s.includes("failure"))
    return "bad";
  if (s.includes("medium") || s.includes("delay") || s.includes("partial")) return "warn";
  if (s.includes("low")) return "good";
  return "neutral";
}

export default function DependencyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<DependencyDetail | null>(null);
  const [options, setOptions] = useState<DependencyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  const [user, setUser] = useState<SessionUser | null>(null);
  const canEdit = sessionCanEdit(user);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, list] = await Promise.all([
      safeFetchJson<DependencyDetail>(`/api/dependencies/${id}`, {
        signal,
        label: "dependency-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<DependencyOption[]>("/api/dependencies", {
        signal,
        label: "dependencies-list",
      }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(list.ok ? list.data.map((d) => ({ id: d.id, depCode: d.depCode })) : []);
    setLastRefresh(new Date());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  useEffect(() => {
    return loadJsonEffect<{ user: SessionUser }>("/api/auth/me", (data) => setUser(data.user), {
      label: "dependency-detail-auth",
    });
  }, []);

  const selectOptions = useMemo(
    () =>
      [...options]
        .filter((o) => o.depCode)
        .sort((a, b) => a.depCode.localeCompare(b.depCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.depCode })),
    [options]
  );

  const onDelete = async () => {
    if (!row) return;
    const ok = window.confirm(
      `Delete ${row.depCode || "this dependency"}? This cannot be undone.`
    );
    if (!ok) return;
    setDeleting(true);
    setActionError(null);
    const result = await safeFetchJson(`/api/dependencies/${row.id}`, {
      method: "DELETE",
      label: "delete-dependency",
      rejectHttpErrors: false,
    });
    setDeleting(false);
    if (!result.ok || result.status >= 300) {
      setActionError("Failed to delete dependency");
      return;
    }
    router.push("/dependencies");
  };

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading dependency…</p>;
  if (!row) return <p className="text-gray-500 dark:text-white/60">Dependency not found.</p>;

  const code = row.depCode || row.id;
  // Excel Source = release (has the dependency); Dependent/Depends On = dependsOnRelease (upstream)
  const source = row.release;
  const dependent = row.dependsOnRelease;

  return (
    <>
      <MockupDetailChrome
        pageTitle="🔗 DEPENDENCY DETAIL PAGE"
        entityCode={code}
        selectLabel="Select Dependency"
        selectValue={row.id}
        selectOptions={selectOptions.length ? selectOptions : [{ value: row.id, label: code }]}
        onSelectChange={(v) => v !== row.id && router.push(`/dependencies/${v}`)}
        lastRefresh={lastRefresh}
        footer="Dependency Page v1.0 | Data sourced from Dependencies sheet | Track inter-release dependencies"
        headerActions={
          canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={cn(taBtnSecondary, "text-sm !py-1.5")}
                onClick={() => {
                  setActionError(null);
                  setEditOpen(true);
                }}
              >
                <Pencil className="mr-1 inline h-3.5 w-3.5" />
                Edit
              </button>
              <button
                type="button"
                className={cn(
                  taBtnPrimary,
                  "text-sm !py-1.5 !bg-rose-600 hover:!bg-rose-700 dark:!bg-rose-600 dark:hover:!bg-rose-500"
                )}
                onClick={() => void onDelete()}
                disabled={deleting}
              >
                <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          ) : null
        }
        quickActions={[
          {
            href: `/releases/${source.id}`,
            label: "📋 View Source Release",
            icon: <Package className="mr-1 inline h-4 w-4" />,
          },
          {
            href: `/releases/${dependent.id}`,
            label: "📋 View Dependent",
            icon: <Package className="mr-1 inline h-4 w-4" />,
          },
          {
            href: "/dependencies",
            label: "📊 Dependency Map",
            icon: <LayoutDashboard className="mr-1 inline h-4 w-4" />,
          },
          { href: "/dependencies", label: "🔙 All Dependencies", icon: <List className="mr-1 inline h-4 w-4" /> },
        ]}
      >
        {actionError ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            {actionError}
          </p>
        ) : null}

        <MockupSection title="🚦 DEPENDENCY STATUS AT A GLANCE">
          <GlanceStrip
            items={[
              {
                label: "Status",
                value: row.status ? <StatusBadge status={row.status} /> : "—",
              },
              { label: "Dependency Type", value: dash(row.dependencyType) },
              {
                label: "Impact if Blocked",
                value: dash(row.impactIfBlocked),
                tone: impactTone(row.impactIfBlocked ?? ""),
              },
            ]}
          />
        </MockupSection>

        <MockupSection title="📤 SOURCE RELEASE (Depends On)">
          <DetailFieldGrid cols={2}>
            <DetailField
              label="Release ID"
              value={
                <ProgressLink
                  href={`/releases/${source.id}`}
                  className="font-mono text-brand-600 hover:underline dark:text-brand-400"
                >
                  {source.releaseCode}
                </ProgressLink>
              }
            />
            <DetailField label="Release Name" value={dash(source.name)} />
          </DetailFieldGrid>
        </MockupSection>

        <MockupSection title="📥 DEPENDENT RELEASE (Waiting For)">
          <DetailFieldGrid cols={2}>
            <DetailField
              label="Depends On ID"
              value={
                <ProgressLink
                  href={`/releases/${dependent.id}`}
                  className="font-mono text-brand-600 hover:underline dark:text-brand-400"
                >
                  {dependent.releaseCode}
                </ProgressLink>
              }
            />
            <DetailField label="Depends On Name" value={dash(dependent.name)} />
          </DetailFieldGrid>
        </MockupSection>

        <MockupSection title="📋 DEPENDENCY DETAILS">
          <DetailFieldGrid cols={2}>
            <DetailField label="Dependency Type" value={dash(row.dependencyType)} />
            <DetailField label="Impact if Blocked" value={dash(row.impactIfBlocked)} />
          </DetailFieldGrid>
        </MockupSection>

        <MockupSection title="📝 NOTES">
          <DetailField label="Notes" value={dash(row.notes)} />
        </MockupSection>
      </MockupDetailChrome>

      <DependencyFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => void load()}
        editId={row.id}
        depCode={code}
        initial={{
          releaseId: source.id,
          dependsOnReleaseId: dependent.id,
          dependencyType: (DEPENDENCY_TYPES as readonly string[]).includes(row.dependencyType)
            ? (row.dependencyType as (typeof DEPENDENCY_TYPES)[number])
            : "Hard",
          status: (DEPENDENCY_STATUSES as readonly string[]).includes(row.status)
            ? (row.status as (typeof DEPENDENCY_STATUSES)[number])
            : "Clear",
          impactIfBlocked: (DEPENDENCY_IMPACTS as readonly string[]).includes(row.impactIfBlocked)
            ? (row.impactIfBlocked as (typeof DEPENDENCY_IMPACTS)[number])
            : "Release Delay",
          notes: row.notes ?? "",
        }}
      />
    </>
  );
}
