"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/searchable-multi-select";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { EditSuccessDialog } from "@/components/detail/editable/EditSuccessDialog";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { generateReleaseId, normalizeProgramProject } from "@/lib/release-id";
import { diffDraftChanges, type FieldChange } from "@/lib/detail-edit-diff";
import { cn } from "@/lib/utils";
import { loadJsonEffect, safeFetchJson } from "@/lib/safe-fetch";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import { LifecycleExceptionConfirm } from "@/components/detail/LifecycleExceptionConfirm";
import {
  buildReleaseFormSaveAlert,
  type ReleaseFormAlert,
} from "@/lib/release-form-save-alert";
import { parseUxNoticesFromHeaders } from "@/lib/ux-notice";
import type { ReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import {
  defaultReleaseStatusLabel,
  editReleaseStatusOptions,
  enabledReleaseStatusLabels,
  previewEditLegalNext,
} from "@/lib/release-lifecycle-status-ui";
import {
  MIN_LIFECYCLE_OVERRIDE_REASON_LENGTH,
  type LegalNextStatusView,
} from "@/lib/release-lifecycle-transition";

/** Fields needed to create/update a release — not every table column. */
export type ReleaseFormData = {
  id?: string;
  releaseCode: string;
  name: string;
  programProject: string;
  owner: string;
  status: string;
  releaseDate: string;
  priority: string;
  impact: string;
  departmentId: string;
  applicationIds: string[];
  dependsOnReleaseIds: string[];
  notes: string;
  releaseSize: string;
  cabDate: string;
  startDate: string;
  testEnvRequired: string;
  uatEnvRequired: string;
  releaseOwnerId: string;
};

type Option = { value: string; label: string };
type AppOption = Option & { departmentId: string };
type EnvOption = Option & { applicationId: string };
type UserOption = Option;

const RELEASE_EDIT_LABELS: Partial<Record<keyof ReleaseFormData, string>> = {
  name: "Name",
  programProject: "Program / Project",
  owner: "Owner",
  status: "Status",
  releaseDate: "End date",
  priority: "Priority",
  impact: "Impact",
  departmentId: "Department",
  applicationIds: "Applications",
  dependsOnReleaseIds: "Depends on",
  notes: "Notes",
  releaseSize: "Release size",
  cabDate: "CAB date",
  startDate: "Start date",
  testEnvRequired: "Test env",
  uatEnvRequired: "UAT env",
  releaseOwnerId: "Release owner",
};

type CreatedSummary = {
  id: string;
  releaseCode: string;
  name: string;
  department: string;
  owner: string;
  applications: string;
  status: string;
  releaseDate: string;
  uatEnvRequired: string;
  testEnvRequired: string;
};

const PRIORITIES = ["P1 - Critical", "P2 - High", "P3 - Medium", "P4 - Low"];
const IMPACTS = ["High", "Medium", "Low"];
const RELEASE_SIZES = ["Small", "Medium", "Large"];

const EMPTY_FORM: ReleaseFormData = {
  releaseCode: "",
  name: "",
  programProject: "",
  owner: "",
  status: "",
  releaseDate: "",
  priority: "P3 - Medium",
  impact: "Medium",
  departmentId: "",
  applicationIds: [],
  dependsOnReleaseIds: [],
  notes: "",
  releaseSize: "Medium",
  cabDate: "",
  startDate: "",
  testEnvRequired: "",
  uatEnvRequired: "",
  releaseOwnerId: "",
};

function dateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function RequiredMark() {
  return <span className="text-rose-500"> *</span>;
}

export function ReleaseFormModal({
  open,
  initial,
  existingReleaseCodes,
  departments,
  applications,
  environments = [],
  releases,
  statusOptions: statusOptionsProp,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: Partial<ReleaseFormData> | null;
  existingReleaseCodes: string[];
  departments: Option[];
  applications: AppOption[];
  environments?: EnvOption[];
  releases: Option[];
  /** Enabled lifecycle status labels from parent (SSOT). */
  statusOptions?: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ReleaseFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadedEnvs, setLoadedEnvs] = useState<EnvOption[]>([]);
  const [lifecycleStatusOptions, setLifecycleStatusOptions] = useState<string[]>(
    []
  );
  const [editLegalNext, setEditLegalNext] = useState<LegalNextStatusView[]>([]);
  const [legalNextLoading, setLegalNextLoading] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [defaultStatusLabel, setDefaultStatusLabel] = useState("Draft");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ReleaseFormData, string>>>({});
  const [formAlert, setFormAlert] = useState<ReleaseFormAlert | null>(null);
  const [created, setCreated] = useState<CreatedSummary | null>(null);
  const [editChanges, setEditChanges] = useState<FieldChange[] | null>(null);
  const editBaseline = useRef<ReleaseFormData | null>(null);
  const isEdit = Boolean(initial?.id);

  const editStatusChoices = useMemo(
    () =>
      isEdit
        ? editReleaseStatusOptions(initial?.status || form.status || "", editLegalNext)
        : [],
    [editLegalNext, form.status, initial?.status, isEdit]
  );

  const selectedNext = useMemo(() => {
    if (!isEdit) return null;
    const current = (initial?.status ?? "").trim().toLocaleLowerCase();
    if (form.status.trim().toLocaleLowerCase() === current) return null;
    return (
      editLegalNext.find(
        (item) => item.label.trim().toLocaleLowerCase() === form.status.trim().toLocaleLowerCase()
      ) ?? null
    );
  }, [editLegalNext, form.status, initial?.status, isEdit]);

  const statusOptions = useMemo(() => {
    if (isEdit) {
      const labels = editStatusChoices.map((o) => o.label);
      if (form.status && !labels.some((l) => l === form.status)) {
        return [...labels, form.status];
      }
      return labels;
    }
    const base =
      statusOptionsProp && statusOptionsProp.length > 0
        ? statusOptionsProp
        : lifecycleStatusOptions;
    return [...new Set([...base, form.status].filter(Boolean))];
  }, [
    editStatusChoices,
    form.status,
    isEdit,
    lifecycleStatusOptions,
    statusOptionsProp,
  ]);

  useEffect(() => {
    if (!open) return;
    return loadJsonEffect<{ id: string; userId: string; name: string }[]>(
      "/api/users",
      (rows) =>
        setUsers(
          rows.map((u) => ({
            value: u.id,
            label: `${u.userId} — ${u.name}`,
          }))
        ),
      { label: "release-form-users" }
    );
  }, [open]);

  useEffect(() => {
    if (!open) {
      setEditLegalNext([]);
      setLegalNextLoading(false);
      return;
    }
    if (isEdit && initial?.id) {
      const current = initial.status || form.status || "";
      // Paint graph next immediately — the per-release lifecycle GET can take >15s.
      setEditLegalNext(
        previewEditLegalNext(current, undefined, {
          name: initial.name,
          owner: initial.owner,
          applicationCount: initial.applicationIds?.length ?? 0,
          releaseSize: initial.releaseSize,
          priority: initial.priority,
          startDate: initial.startDate || null,
          releaseDate: initial.releaseDate || null,
        })
      );
      setLegalNextLoading(true);
      const stop = loadJsonEffect<{
        currentLabel: string;
        next: LegalNextStatusView[];
      }>(
        `/api/releases/${initial.id}/lifecycle?preview=1`,
        (payload) => {
          setEditLegalNext(payload.next ?? []);
        },
        {
          label: "release-form-legal-next",
          onFinally: () => setLegalNextLoading(false),
        }
      );
      return () => {
        stop();
        setLegalNextLoading(false);
      };
    }
    if (statusOptionsProp && statusOptionsProp.length > 0) {
      setDefaultStatusLabel(statusOptionsProp[0] ?? "Draft");
      return;
    }
    return loadJsonEffect<{ config: ReleaseLifecycleConfig }>(
      "/api/release-lifecycle-config",
      (payload) => {
        setLifecycleStatusOptions(enabledReleaseStatusLabels(payload.config));
        setDefaultStatusLabel(
          defaultReleaseStatusLabel(payload.config) || "Draft"
        );
      },
      { label: "release-form-lifecycle-statuses" }
    );
    // Create-mode labels: length/[0] avoid aborting the edit fetch on parent rerenders.
  }, [initial?.id, initial?.status, isEdit, open, statusOptionsProp?.length, statusOptionsProp?.[0]]);

  useEffect(() => {
    if (!open || environments.length > 0) {
      setLoadedEnvs([]);
      return;
    }
    return loadJsonEffect<{ id: string; name: string; applicationId: string }[]>(
      "/api/environments",
      (rows) =>
        setLoadedEnvs(
          rows.map((e) => ({
            value: e.name,
            label: e.name,
            applicationId: e.applicationId,
          }))
        ),
      { label: "release-form-environments" }
    );
  }, [open, environments.length]);

  // Clear success screens only when the modal fully closes — not when parent
  // refreshes list/detail data after save (that was wiping the confirmation instantly).
  useEffect(() => {
    if (open) return;
    setCreated(null);
    setEditChanges(null);
    setFieldErrors({});
    setFormAlert(null);
    setOverrideReason("");
    setEditLegalNext([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Keep create/edit confirmation visible while parent reloads after onSaved().
    if (created || editChanges) return;
    setFieldErrors({});
    setFormAlert(null);
    const next: ReleaseFormData = {
      ...EMPTY_FORM,
      releaseCode: initial?.releaseCode ?? generateReleaseId(existingReleaseCodes),
      name: initial?.name ?? "",
      programProject: initial?.programProject ?? "",
      owner: initial?.owner ?? "",
      status: initial?.status ?? defaultStatusLabel,
      releaseDate: dateInput(initial?.releaseDate),
      priority: initial?.priority ?? "P3 - Medium",
      impact: initial?.impact ?? "Medium",
      departmentId: initial?.departmentId ?? "",
      applicationIds: initial?.applicationIds ?? [],
      dependsOnReleaseIds: initial?.dependsOnReleaseIds ?? [],
      notes: initial?.notes ?? "",
      releaseSize: initial?.releaseSize ?? "Medium",
      cabDate: dateInput(initial?.cabDate),
      startDate: dateInput(initial?.startDate),
      testEnvRequired: initial?.testEnvRequired ?? "",
      uatEnvRequired: initial?.uatEnvRequired ?? "",
      releaseOwnerId: initial?.releaseOwnerId ?? "",
    };
    if (initial?.id) next.id = initial.id;
    setForm(next);
    editBaseline.current = initial?.id ? { ...next } : null;
  }, [open, initial, existingReleaseCodes, created, editChanges, defaultStatusLabel]);

  const departmentName = useMemo(
    () => departments.find((d) => d.value === form.departmentId)?.label ?? "",
    [departments, form.departmentId]
  );

  const filteredApps = useMemo(() => {
    if (!form.departmentId) return [];
    return applications.filter((a) => a.departmentId === form.departmentId);
  }, [applications, form.departmentId]);

  /** Owners are global — do not filter by selected department. */
  const ownerOptions = useMemo(
    () => [...users].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    [users]
  );

  const envSource = environments.length > 0 ? environments : loadedEnvs;
  const appIdsInDept = useMemo(() => new Set(filteredApps.map((a) => a.value)), [filteredApps]);
  const appIdsForEnv = useMemo(() => {
    if (form.applicationIds.length) return new Set(form.applicationIds);
    return appIdsInDept;
  }, [form.applicationIds, appIdsInDept]);

  const testEnvOptions = useMemo(() => {
    const rows = envSource.filter(
      (e) =>
        appIdsForEnv.has(e.applicationId) &&
        /test/i.test(e.label) &&
        !/uat/i.test(e.label)
    );
    const names = [...new Set(rows.map((e) => e.label))].sort();
    return names.map((n) => ({ value: n, label: n }));
  }, [envSource, appIdsForEnv]);

  const uatEnvOptions = useMemo(() => {
    const rows = envSource.filter(
      (e) => appIdsForEnv.has(e.applicationId) && /uat/i.test(e.label)
    );
    const names = [...new Set(rows.map((e) => e.label))].sort();
    return names.map((n) => ({ value: n, label: n }));
  }, [envSource, appIdsForEnv]);

  const releaseOptions = useMemo(
    () => releases.filter((r) => r.value !== initial?.id),
    [releases, initial?.id]
  );

  if (!open) return null;

  const regenerateId = () => {
    const codes = isEdit
      ? existingReleaseCodes.filter((c) => c !== initial?.releaseCode)
      : existingReleaseCodes;
    setForm((f) => ({ ...f, releaseCode: generateReleaseId(codes) }));
  };

  const set = <K extends keyof ReleaseFormData>(key: K, value: ReleaseFormData[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const onDepartmentChange = (departmentId: string) => {
    setForm((f) => ({
      ...f,
      departmentId,
      // Apps and envs are department-scoped; owner is not.
      applicationIds: [],
      testEnvRequired: "",
      uatEnvRequired: "",
    }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.departmentId;
      delete next.applicationIds;
      return next;
    });
  };

  const validate = (): boolean => {
    const errors: Partial<Record<keyof ReleaseFormData, string>> = {};
    if (!form.releaseCode.trim()) errors.releaseCode = "Release ID is required";
    if (!form.name.trim()) errors.name = "Release name is required";
    if (!form.departmentId) errors.departmentId = "Department is required";
    if (!form.releaseOwnerId) errors.releaseOwnerId = "Release owner is required";
    if (!form.applicationIds.length) errors.applicationIds = "Select at least one application";
    if (!form.releaseDate) errors.releaseDate = "End date is required";
    if (!form.status) errors.status = "Status is required";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setFormAlert({
        title: "Missing required fields",
        message: "Please fill in the required fields highlighted below.",
      });
      return false;
    }
    setFormAlert(null);
    return true;
  };

  const save = async () => {
    if (!validate()) return;
    if (isEdit && selectedNext?.outcome === "blocked") {
      setFormAlert({
        title: "Status change blocked",
        message: `You can’t move this release to “${selectedNext.label}” until the required checks pass.`,
        details: selectedNext.gates
          .filter((g) => g.hard && !g.passed)
          .map((g) => g.reason),
      });
      return;
    }
    if (
      isEdit &&
      selectedNext?.outcome === "needs_override" &&
      overrideReason.trim().length < MIN_LIFECYCLE_OVERRIDE_REASON_LENGTH
    ) {
      setFormAlert({
        title: "Status change blocked",
        message:
          "This step needs an exception note. Some checks aren’t met. Enter a short reason (at least 3 characters) explaining why you’re allowed to continue, then try again.",
        details: selectedNext.gates
          .filter((g) => !g.passed)
          .map((g) => g.reason),
      });
      return;
    }
    setSaving(true);
    setFormAlert(null);
    const ownerLabel = users.find((u) => u.value === form.releaseOwnerId)?.label;
    const ownerName = ownerLabel?.includes(" — ")
      ? ownerLabel.split(" — ").slice(1).join(" — ")
      : form.owner;
    const payload: Record<string, unknown> = {
      ...form,
      programProject: normalizeProgramProject(form.programProject) ?? "N/A",
      owner: ownerName || form.owner || "Unknown",
      cabDate: form.cabDate || null,
      startDate: form.startDate || null,
      releaseOwnerId: form.releaseOwnerId || null,
      notes: form.notes.trim() || null,
      testEnvRequired: form.testEnvRequired.trim() || null,
      uatEnvRequired: form.uatEnvRequired.trim() || null,
      releaseSize: form.releaseSize || null,
    };
    if (
      isEdit &&
      selectedNext?.outcome === "needs_override" &&
      overrideReason.trim().length >= MIN_LIFECYCLE_OVERRIDE_REASON_LENGTH
    ) {
      payload.overrideReason = overrideReason.trim();
    }

    // Dev compile + Neon cold starts can take a long time; never leave Save stuck forever.
    const ac = new AbortController();
    const timeoutId = window.setTimeout(() => ac.abort(), 60_000);
    try {
      const result = await safeFetchJson<{ id: string; releaseCode?: string; name?: string }>(
        isEdit ? `/api/releases/${initial!.id}` : "/api/releases",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          label: "release-form-save",
          rejectHttpErrors: false,
          signal: ac.signal,
        }
      );
      if (!result.ok || (result.status ?? 0) >= 300) {
        const data = result.ok ? result.data : null;
        if (!result.ok && result.code === "aborted") {
          setFormAlert({
            title: "Save timed out",
            message:
              "The server may still be compiling or the database is slow — wait a moment and try again.",
          });
          return;
        }
        setFormAlert(
          buildReleaseFormSaveAlert(
            data,
            !result.ok ? result.error : "Failed to save release"
          )
        );
        return;
      }

      // VR-21 (and similar): announce status side effects after a successful save.
      if (result.ok && result.headers) {
        const notices = parseUxNoticesFromHeaders(result.headers);
        if (notices[0]) {
          setFormAlert({
            title: notices[0].title,
            message: notices[0].message,
            details: notices[0].details,
            variant: "notice",
          });
        }
      }

      onSaved();
      if (isEdit) {
        const before = editBaseline.current;
        const afterForDiff: ReleaseFormData = {
          ...form,
          applicationIds: form.applicationIds,
          dependsOnReleaseIds: form.dependsOnReleaseIds,
        };
        // Compare display-friendly snapshots for multi-selects.
        const beforeSnap = {
          ...(before ?? form),
          applicationIds: (before?.applicationIds ?? []).join(", "),
          dependsOnReleaseIds: (before?.dependsOnReleaseIds ?? []).join(", "),
        } as unknown as Record<string, unknown>;
        const afterSnap = {
          ...afterForDiff,
          applicationIds: form.applicationIds.join(", "),
          dependsOnReleaseIds: form.dependsOnReleaseIds.join(", "),
        } as unknown as Record<string, unknown>;
        setEditChanges(
          diffDraftChanges(beforeSnap, afterSnap, RELEASE_EDIT_LABELS as Partial<Record<string, string>>)
        );
        return;
      }

      const appLabels = form.applicationIds
        .map((id) => filteredApps.find((a) => a.value === id)?.label ?? id)
        .join(", ");
      setCreated({
        id: result.data.id,
        releaseCode: result.data.releaseCode ?? form.releaseCode,
        name: result.data.name ?? form.name,
        department: departmentName || "—",
        owner: ownerName || "—",
        applications: appLabels || "—",
        status: form.status,
        releaseDate: form.releaseDate,
        uatEnvRequired: form.uatEnvRequired || "—",
        testEnvRequired: form.testEnvRequired || "—",
      });
    } finally {
      window.clearTimeout(timeoutId);
      setSaving(false);
    }
  };

  if (editChanges) {
    return (
      <EditSuccessDialog
        open
        entityLabel="Release"
        entityCode={form.releaseCode}
        changes={editChanges}
        onDone={onClose}
      />
    );
  }

  if (created) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div
          className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-theme-lg dark:bg-[var(--card)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Release created</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-white/60">
                Your release was saved successfully.
              </p>
            </div>
          </div>

          <dl className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm dark:border-[var(--border)] dark:bg-white/5">
            <SummaryRow label="Release ID" value={created.releaseCode} mono />
            <SummaryRow label="Name" value={created.name} />
            <SummaryRow label="Department" value={created.department} />
            <SummaryRow label="Owner" value={created.owner} />
            <SummaryRow label="Application/s" value={created.applications} />
            <SummaryRow label="Status" value={created.status} />
            <SummaryRow label="End date" value={created.releaseDate} />
            <SummaryRow label="Test env" value={created.testEnvRequired} />
            <SummaryRow label="UAT env" value={created.uatEnvRequired} />
          </dl>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={taBtnSecondary}
              onClick={() => {
                // Clearing created re-runs form init with the refreshed release-code list.
                setCreated(null);
              }}
            >
              Create another
            </button>
            <ProgressLink href={`/releases/${created.id}`} className={cn(taBtnSecondary, "inline-flex items-center")}>
              View release
            </ProgressLink>
            <button type="button" className={taBtnPrimary} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-theme-lg p-6 max-h-[90vh] overflow-y-auto dark:bg-[var(--card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-1">
          {isEdit ? "Edit release" : "New release"}
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Fields marked <span className="text-rose-500">*</span> are required. Choosing a department
          filters applications and environments for that department.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-500">
              Release ID
              <RequiredMark />
            </label>
            <div className="mt-1 flex gap-2">
              <input
                className={cn(
                  taInput,
                  "font-mono text-sm bg-gray-50",
                  fieldErrors.releaseCode && "border-rose-400"
                )}
                value={form.releaseCode}
                onChange={(e) => set("releaseCode", e.target.value.toUpperCase())}
                readOnly
                placeholder="Auto-generated unique ID"
              />
              {!isEdit && (
                <button
                  type="button"
                  onClick={regenerateId}
                  className="shrink-0 rounded-lg border border-gray-200 px-3 text-gray-500 hover:bg-brand-50 hover:text-brand-600"
                  title="Generate new ID"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}
            </div>
            <FieldError message={fieldErrors.releaseCode} />
          </div>

          <Field
            label="Release Name"
            required
            value={form.name}
            onChange={(v) => set("name", v)}
            error={fieldErrors.name}
          />
          <Field
            label="Program / Project"
            value={form.programProject}
            onChange={(v) => set("programProject", v)}
            placeholder="N/A for hotfixes, infra, security…"
          />

          <div>
            <label className="text-xs font-medium text-gray-500">
              Department
              <RequiredMark />
            </label>
            <div className="mt-1">
              <SearchableSelect
                value={form.departmentId}
                onChange={onDepartmentChange}
                options={departments}
                placeholder="Select department…"
                searchPlaceholder="Search departments…"
                className={fieldErrors.departmentId ? "[&_button]:border-rose-400" : undefined}
              />
            </div>
            <FieldError message={fieldErrors.departmentId} />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">
              Release Owner
              <RequiredMark />
            </label>
            <div className="mt-1">
              <SearchableSelect
                value={form.releaseOwnerId}
                onChange={(v) => set("releaseOwnerId", v)}
                options={ownerOptions}
                placeholder="Select owner…"
                searchPlaceholder="Search users…"
                className={fieldErrors.releaseOwnerId ? "[&_button]:border-rose-400" : undefined}
              />
            </div>
            <FieldError message={fieldErrors.releaseOwnerId} />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-500">
              Application/s
              <RequiredMark />
            </label>
            <div className="mt-1">
              <SearchableMultiSelect
                values={form.applicationIds}
                onChange={(v) => set("applicationIds", v)}
                options={filteredApps}
                placeholder={
                  form.departmentId ? "Select applications…" : "Select department first…"
                }
                searchPlaceholder="Search applications…"
                disabled={!form.departmentId}
                className={fieldErrors.applicationIds ? "[&_button]:border-rose-400" : undefined}
              />
            </div>
            <FieldError message={fieldErrors.applicationIds} />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">
              Status
              <RequiredMark />
            </label>
            <select
              className={cn(taInput, fieldErrors.status && "border-rose-400")}
              value={form.status}
              onChange={(e) => {
                set("status", e.target.value);
                setOverrideReason("");
              }}
            >
              {isEdit
                ? editStatusChoices.map((opt) => (
                    <option key={opt.label} value={opt.label} disabled={opt.disabled}>
                      {opt.outcome === "current"
                        ? opt.label
                        : opt.outcome === "needs_override"
                          ? `${opt.label} · reason needed`
                          : opt.outcome === "blocked"
                            ? `${opt.label} · blocked`
                            : opt.label}
                    </option>
                  ))
                : statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
            </select>
            {isEdit ? (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-white/50">
                {legalNextLoading
                  ? "Showing the next steps from the lifecycle graph. Confirming checks…"
                  : "Only the next allowed steps are listed. Blocked steps can’t be chosen until their checks pass."}
              </p>
            ) : null}
            <FieldError message={fieldErrors.status} />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Release Size</label>
            <select
              className={taInput}
              value={form.releaseSize}
              onChange={(e) => set("releaseSize", e.target.value)}
            >
              {RELEASE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Priority</label>
            <select
              className={taInput}
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
            >
              {[...new Set([...PRIORITIES, form.priority].filter(Boolean))].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Impact</label>
            <select
              className={taInput}
              value={form.impact}
              onChange={(e) => set("impact", e.target.value)}
            >
              {IMPACTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">CAB Date</label>
            <input
              type="date"
              className={taInput}
              value={form.cabDate}
              onChange={(e) => set("cabDate", e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Start Date</label>
            <input
              type="date"
              className={taInput}
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">
              End Date
              <RequiredMark />
            </label>
            <input
              type="date"
              className={cn(taInput, fieldErrors.releaseDate && "border-rose-400")}
              value={form.releaseDate}
              onChange={(e) => set("releaseDate", e.target.value)}
            />
            <FieldError message={fieldErrors.releaseDate} />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Test Env Required</label>
            <select
              className={taInput}
              value={form.testEnvRequired}
              onChange={(e) => set("testEnvRequired", e.target.value)}
              disabled={!form.departmentId}
            >
              <option value="">
                {form.departmentId ? "Select test env…" : "Select department first…"}
              </option>
              {form.testEnvRequired &&
                !testEnvOptions.some((o) => o.value === form.testEnvRequired) && (
                  <option value={form.testEnvRequired}>{form.testEnvRequired}</option>
                )}
              {testEnvOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">UAT Env Required</label>
            <select
              className={taInput}
              value={form.uatEnvRequired}
              onChange={(e) => set("uatEnvRequired", e.target.value)}
              disabled={!form.departmentId}
            >
              <option value="">
                {form.departmentId ? "Select UAT env…" : "Select department first…"}
              </option>
              {form.uatEnvRequired &&
                !uatEnvOptions.some((o) => o.value === form.uatEnvRequired) && (
                  <option value={form.uatEnvRequired}>{form.uatEnvRequired}</option>
                )}
              {uatEnvOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-500">Depends On</label>
            <div className="mt-1">
              <SearchableMultiSelect
                values={form.dependsOnReleaseIds}
                onChange={(v) => set("dependsOnReleaseIds", v)}
                options={releaseOptions}
                placeholder="Select dependent releases…"
                searchPlaceholder="Search releases…"
              />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium text-gray-500">Notes</label>
          <textarea
            className={`${taInput} min-h-[72px] mt-1`}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        {selectedNext && selectedNext.outcome !== "allowed" ? (
          <div className="mt-4">
            <LifecycleExceptionConfirm
              targetLabel={selectedNext.label}
              isReturn={selectedNext.isPreviousStatus}
              needsException={selectedNext.outcome === "needs_override"}
              blocked={selectedNext.outcome === "blocked"}
              exceptionReason={overrideReason}
              onExceptionReasonChange={setOverrideReason}
              busy={saving}
              confirmDisabled={
                saving ||
                selectedNext.outcome === "blocked" ||
                (selectedNext.outcome === "needs_override" &&
                  overrideReason.trim().length < MIN_LIFECYCLE_OVERRIDE_REASON_LENGTH)
              }
              onCancel={() => {
                set("status", initial?.status ?? form.status);
                setOverrideReason("");
              }}
              onConfirm={() => void save()}
              checks={selectedNext.gates.map((gate) => ({
                label: gate.label,
                passed: gate.passed,
                reason: gate.reason,
                hard: gate.hard,
                soft: gate.soft,
              }))}
            />
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={taBtnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={taBtnPrimary} onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <FormAlertDialog alert={formAlert} onDismiss={() => setFormAlert(null)} />
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">{message}</p>;
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500 dark:text-white/55">{label}</dt>
      <dd className={cn("text-right font-medium text-gray-900 dark:text-white", mono && "font-mono text-xs")}>
        {value}
      </dd>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500">
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      <input
        className={cn(taInput, error && "border-rose-400")}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldError message={error} />
    </div>
  );
}
