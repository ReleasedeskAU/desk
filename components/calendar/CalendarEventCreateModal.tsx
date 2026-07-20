"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchableSelect } from "@/components/ui/searchable-multi-select";
import {
  CreateConfirmation,
  CreateModalShell,
  FieldError,
  RequiredMark,
  SummaryRow,
} from "@/components/create-flow/CreateFlowUi";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { safeFetchJson } from "@/lib/safe-fetch";
import { CALENDAR_EVENT_TYPES } from "@/lib/validation/calendar";
import { CALENDAR_SIZE_IMPACT_OPTIONS } from "@/lib/calendar-table";

type ReleaseOption = {
  id: string;
  releaseCode: string;
  name: string;
  applicationIds: string[];
  applicationNames: string[];
  departmentName?: string | null;
};

type ApplicationOption = {
  id: string;
  name: string;
  departmentId: string;
};

type DepartmentOption = {
  id: string;
  name: string;
};

type CreatedEvent = {
  id: string;
  date: string;
  eventType: string;
  title: string;
  applicationName: string | null;
  departmentName: string | null;
  sizeImpact: string | null;
  notes: string | null;
  release?: { releaseCode: string; status: string; name?: string } | null;
};

const ALL_DEPARTMENT = "ALL";

const emptyForm = () => ({
  date: "",
  eventType: "CAB MEETING",
  title: "",
  releaseId: "",
  applicationId: "",
  departmentId: "",
  departmentName: "",
  sizeImpact: "",
  notes: "",
});

/**
 * Creates a Release Calendar entry (date, type, title, optional release link).
 * Application/Department are selectable; department auto-fills from application.
 */
export function CalendarEventCreateModal({
  open,
  onClose,
  onCreated,
  eventTypes = [],
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  eventTypes?: string[];
}) {
  const [form, setForm] = useState(emptyForm);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [applications, setApplications] = useState<ApplicationOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedEvent | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm());
    setErrors({});
    setError(null);
    setCreated(null);
    setLoading(true);
    const ac = new AbortController();
    void (async () => {
      const [releaseResult, applicationResult, departmentResult] = await Promise.all([
        safeFetchJson<
          {
            id: string;
            releaseCode: string;
            name: string;
            department?: { name: string } | null;
            applications?: { application: { id: string; name: string } }[];
          }[]
        >("/api/releases", { signal: ac.signal, label: "calendar-create-releases" }),
        safeFetchJson<ApplicationOption[]>("/api/applications", {
          signal: ac.signal,
          label: "calendar-create-applications",
        }),
        safeFetchJson<DepartmentOption[]>("/api/departments", {
          signal: ac.signal,
          label: "calendar-create-departments",
        }),
      ]);
      if (ac.signal.aborted) return;
      setLoading(false);
      if (!releaseResult.ok || !applicationResult.ok || !departmentResult.ok) {
        setError("Could not load lookup data.");
        return;
      }
      setApplications(
        applicationResult.data
          .map((app) => ({
            id: app.id,
            name: app.name,
            departmentId: app.departmentId,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setDepartments(
        departmentResult.data
          .map((dept) => ({ id: dept.id, name: dept.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setReleases(
        releaseResult.data.map((release) => ({
          id: release.id,
          releaseCode: release.releaseCode,
          name: release.name,
          applicationIds: release.applications?.map((item) => item.application.id) ?? [],
          applicationNames: release.applications?.map((item) => item.application.name) ?? [],
          departmentName: release.department?.name ?? null,
        })),
      );
    })();
    return () => ac.abort();
  }, [open]);

  const typeOptions = useMemo(
    () => [...new Set([...CALENDAR_EVENT_TYPES, ...eventTypes].filter(Boolean))].sort(),
    [eventTypes],
  );

  const departmentOptions = useMemo(
    () => [
      { value: ALL_DEPARTMENT, label: "ALL (org-wide)" },
      ...departments.map((dept) => ({ value: dept.id, label: dept.name })),
    ],
    [departments],
  );

  const applicationOptions = useMemo(
    () => applications.map((app) => ({ value: app.id, label: app.name })),
    [applications],
  );

  if (!open) return null;

  const set = (key: keyof ReturnType<typeof emptyForm>, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const departmentNameFor = (departmentId: string) => {
    if (departmentId === ALL_DEPARTMENT) return ALL_DEPARTMENT;
    return departments.find((dept) => dept.id === departmentId)?.name ?? "";
  };

  const onApplicationChange = (applicationId: string) => {
    const app = applications.find((item) => item.id === applicationId);
    const departmentId = app?.departmentId ?? "";
    setForm((current) => ({
      ...current,
      applicationId,
      departmentId,
      departmentName: departmentNameFor(departmentId),
    }));
  };

  const onDepartmentChange = (departmentId: string) => {
    setForm((current) => ({
      ...current,
      departmentId,
      departmentName: departmentNameFor(departmentId),
    }));
  };

  const onReleaseChange = (releaseId: string) => {
    const release = releases.find((item) => item.id === releaseId);
    const firstAppId = release?.applicationIds[0] ?? "";
    const app = applications.find((item) => item.id === firstAppId);
    const departmentFromApp = app?.departmentId ?? "";
    const departmentFromName = release?.departmentName
      ? departments.find((dept) => dept.name === release.departmentName)?.id ?? ""
      : "";
    const departmentId = departmentFromApp || departmentFromName;

    setForm((current) => ({
      ...current,
      releaseId,
      title: current.title.trim() || (release ? release.name : current.title),
      applicationId: current.applicationId || firstAppId,
      departmentId: current.departmentId || departmentId,
      departmentName:
        current.departmentName ||
        departmentNameFor(departmentId) ||
        release?.departmentName ||
        "",
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next.releaseId;
      delete next.title;
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.date) nextErrors.date = "Date is required";
    if (!form.eventType.trim()) nextErrors.eventType = "Event type is required";
    if (!form.title.trim()) nextErrors.title = "Title is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError("Please correct the highlighted fields.");
      return;
    }

    const applicationName =
      applications.find((app) => app.id === form.applicationId)?.name?.trim() || null;
    const departmentName =
      form.departmentId === ALL_DEPARTMENT
        ? ALL_DEPARTMENT
        : departmentNameFor(form.departmentId).trim() || form.departmentName.trim() || null;

    setSaving(true);
    setError(null);
    const result = await safeFetchJson<CreatedEvent & { error?: string }>("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date,
        eventType: form.eventType.trim(),
        title: form.title.trim(),
        releaseId: form.releaseId || null,
        applicationName,
        departmentName,
        sizeImpact: form.sizeImpact.trim() || null,
        notes: form.notes.trim() || null,
      }),
      label: "create-calendar-event",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      setError(
        result.ok && result.data.error ? result.data.error : "Failed to create calendar entry",
      );
      return;
    }
    onCreated();
    setCreated(result.data);
  };

  if (created) {
    return (
      <CreateConfirmation
        entity="Calendar entry"
        viewHref="/calendar"
        onClose={onClose}
        onCreateAnother={() => {
          setCreated(null);
          setForm(emptyForm());
          setError(null);
        }}
      >
        <SummaryRow label="Date" value={created.date.slice(0, 10)} />
        <SummaryRow label="Event type" value={created.eventType} />
        <SummaryRow label="Title" value={created.title} />
        <SummaryRow
          label="Release"
          value={created.release?.releaseCode ?? "—"}
          mono={Boolean(created.release?.releaseCode)}
        />
        <SummaryRow label="Application" value={created.applicationName || "—"} />
        <SummaryRow label="Department" value={created.departmentName || "—"} />
        <SummaryRow label="Size / impact" value={created.sizeImpact || "—"} />
      </CreateConfirmation>
    );
  }

  return (
    <CreateModalShell
      title="New Calendar Entry"
      description="Add a CAB, freeze, release, or maintenance event to the Release Calendar. Fields marked * are required."
      onClose={onClose}
    >
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Date
            <RequiredMark />
            <input
              type="date"
              className={cn(taInput, "mt-1", errors.date && "border-rose-400")}
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
            />
            <FieldError message={errors.date} />
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Event type
            <RequiredMark />
            <select
              className={cn(taInput, "mt-1", errors.eventType && "border-rose-400")}
              value={form.eventType}
              onChange={(e) => set("eventType", e.target.value)}
            >
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <FieldError message={errors.eventType} />
          </label>
        </div>

        <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
          Title
          <RequiredMark />
          <input
            type="text"
            maxLength={500}
            className={cn(taInput, "mt-1", errors.title && "border-rose-400")}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. July CAB / Change freeze"
          />
          <FieldError message={errors.title} />
        </label>

        <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
          Linked release
          <div className="mt-1">
            <SearchableSelect
              value={form.releaseId}
              onChange={onReleaseChange}
              options={releases.map((release) => ({
                value: release.id,
                label: `${release.releaseCode} — ${release.name}`,
              }))}
              placeholder={loading ? "Loading…" : "Optional — select release…"}
              disabled={loading}
              allowClear
            />
          </div>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Application
            <div className="mt-1">
              <SearchableSelect
                value={form.applicationId}
                onChange={onApplicationChange}
                options={applicationOptions}
                placeholder={loading ? "Loading…" : "Optional — select application…"}
                searchPlaceholder="Search applications…"
                disabled={loading}
                allowClear
              />
            </div>
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Department
            <div className="mt-1">
              <SearchableSelect
                value={form.departmentId}
                onChange={onDepartmentChange}
                options={departmentOptions}
                placeholder={loading ? "Loading…" : "Optional — select department…"}
                searchPlaceholder="Search departments…"
                disabled={loading}
                allowClear
              />
            </div>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-white/50">
              Auto-filled from Application. Choose ALL for org-wide.
            </p>
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70 sm:col-span-2">
            Size / impact
            <select
              className={cn(taInput, "mt-1")}
              value={form.sizeImpact}
              onChange={(e) => set("sizeImpact", e.target.value)}
            >
              <option value="">Optional</option>
              {CALENDAR_SIZE_IMPACT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
          Notes
          <textarea
            className={cn(taInput, "mt-1 min-h-[72px]")}
            maxLength={2000}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </label>

        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className={taBtnPrimary} disabled={saving || loading}>
            {saving ? "Creating…" : "Create entry"}
          </button>
        </div>
      </form>
    </CreateModalShell>
  );
}
