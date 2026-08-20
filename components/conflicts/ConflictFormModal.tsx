"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CreatedConfirmation,
  FormError,
  RequiredMark,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/forms/create-modal-primitives";
import { SearchableSelect } from "@/components/ui/searchable-multi-select";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { useEntityLifecycleStatuses } from "@/hooks/useEntityLifecycleStatuses";
import { CONFLICT_TYPES, mergeConflictTypes } from "@/lib/validation/conflict";

const CONFLICT_PRIORITIES = ["P1 - Critical", "P2 - High", "P3 - Medium"] as const;

type Department = { id: string; name: string };
type Application = { id: string; name: string; departmentId: string };
type Environment = { id: string; name: string; applicationId: string };
type Release = { id: string; releaseCode: string; name: string };

type FormValues = {
  status: string;
  priority: (typeof CONFLICT_PRIORITIES)[number];
  departmentId: string;
  applicationId: string;
  release1Code: string;
  release2Code: string;
  conflictingEnvironment: string;
  environmentConflictType: string;
  assignedTo: string;
  notes: string;
};

type CreatedConflict = {
  id: string;
  conflictCode: string;
  status: string;
  priority: string;
  release1Code: string;
  release2Code: string;
  application: string;
  department: string;
  conflictingEnvironment: string;
  environmentConflictType: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  conflictTypeOptions?: string[];
  /** Enabled lifecycle status labels from parent (SSOT). Falls back to hook. */
  statusOptions?: string[];
  /** Default create status from lifecycle config. */
  defaultStatus?: string;
  /** When set, Release 1 is this release. */
  lockRelease1Code?: string;
  /** Prefill department / application from the parent release. */
  lockOrg?: { departmentId: string; applicationId: string } | null;
};

/** Overlay + dialog chrome — viewport-capped so long release names cannot force a horizontal scroll. */
function ConflictModalFrame({
  children,
  labelledBy,
  onClose,
}: {
  children: React.ReactNode;
  labelledBy: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-x-hidden overflow-y-auto bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(event) => event.stopPropagation()}
        className="my-auto flex w-full min-w-0 max-h-[min(90dvh,52rem)] max-w-[min(42rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-[var(--card)]"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Creates a validated environment conflict; Conflict ID is server-generated.
 * From a release page, Release 1 / department / application stay locked.
 */
export function ConflictFormModal({
  open,
  onClose,
  onCreated,
  conflictTypeOptions = [],
  statusOptions: statusOptionsProp,
  defaultStatus: defaultStatusProp,
  lockRelease1Code,
  lockOrg = null,
}: Props) {
  const lifecycle = useEntityLifecycleStatuses("/api/conflict-lifecycle-config");
  const createOptions =
    statusOptionsProp && statusOptionsProp.length > 0
      ? statusOptionsProp
      : lifecycle.createOptions;
  const defaultStatus = defaultStatusProp || lifecycle.defaultStatus || "Detected";
  const typeOptions = useMemo(() => mergeConflictTypes(conflictTypeOptions), [conflictTypeOptions]);
  const scoped = Boolean(lockRelease1Code);

  const lockedDepartmentId = lockOrg?.departmentId ?? "";
  const lockedApplicationId = lockOrg?.applicationId ?? "";
  const emptyForm = useCallback((): FormValues => ({
    status: defaultStatus,
    priority: "P2 - High",
    departmentId: lockedDepartmentId,
    applicationId: lockedApplicationId,
    release1Code: lockRelease1Code ?? "",
    release2Code: "",
    conflictingEnvironment: "",
    environmentConflictType: typeOptions[0] ?? CONFLICT_TYPES[0],
    assignedTo: "",
    notes: "",
  }), [defaultStatus, lockedDepartmentId, lockedApplicationId, lockRelease1Code, typeOptions]);

  const [form, setForm] = useState<FormValues>(emptyForm);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [created, setCreated] = useState<CreatedConflict | null>(null);

  const statusSelectOptions = useMemo(() => {
    const base = createOptions.length > 0 ? createOptions : [defaultStatus].filter(Boolean);
    return [...new Set([...base, form.status].filter(Boolean))];
  }, [createOptions, defaultStatus, form.status]);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm());
    setCreated(null);
    setFormError(null);
    setFieldErrors({});
    setLoadingLookups(true);
    const ac = new AbortController();
    void (async () => {
      const [departmentResult, applicationResult, environmentResult, releaseResult] = await Promise.all([
        safeFetchJson<Department[]>("/api/departments", { signal: ac.signal, label: "conflict-form-departments" }),
        safeFetchJson<Application[]>("/api/applications", { signal: ac.signal, label: "conflict-form-applications" }),
        safeFetchJson<Environment[]>("/api/environments", { signal: ac.signal, label: "conflict-form-environments" }),
        safeFetchJson<Release[]>("/api/releases", { signal: ac.signal, label: "conflict-form-releases" }),
      ]);
      if (ac.signal.aborted) return;
      setLoadingLookups(false);
      if (!departmentResult.ok || !applicationResult.ok || !environmentResult.ok || !releaseResult.ok) {
        setFormError("Could not load the form lookups. Close and try again.");
        return;
      }
      setDepartments(departmentResult.data);
      setApplications(applicationResult.data);
      setEnvironments(environmentResult.data);
      setReleases(releaseResult.data);
    })();
    return () => ac.abort();
  }, [open, emptyForm]);

  // When lifecycle options arrive after open, snap create form to the enabled default.
  useEffect(() => {
    if (!open || createOptions.length === 0) return;
    setForm((prev) => {
      if (createOptions.includes(prev.status)) return prev;
      return { ...prev, status: defaultStatus || createOptions[0]! };
    });
  }, [open, createOptions, defaultStatus]);

  const filteredApplications = useMemo(
    () => applications.filter((application) => application.departmentId === form.departmentId),
    [applications, form.departmentId]
  );
  const filteredEnvironments = useMemo(
    () => environments.filter((environment) => environment.applicationId === form.applicationId),
    [environments, form.applicationId]
  );
  const otherReleases = useMemo(
    () => releases.filter((item) => item.releaseCode !== form.release1Code),
    [releases, form.release1Code]
  );
  const departmentName = departments.find((item) => item.id === form.departmentId)?.name ?? "";
  const applicationName = applications.find((item) => item.id === form.applicationId)?.name ?? "";
  const release1 = releases.find((item) => item.releaseCode === form.release1Code);

  if (!open) return null;

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const validate = () => {
    const errors: Partial<Record<keyof FormValues, string>> = {};
    if (!form.status) errors.status = "Status is required";
    if (!form.priority) errors.priority = "Priority is required";
    if (!form.departmentId) errors.departmentId = "Department is required";
    if (!form.applicationId) errors.applicationId = "Application is required";
    if (!form.release1Code) errors.release1Code = "Release 1 is required";
    if (!form.release2Code) errors.release2Code = "Release 2 is required";
    if (form.release1Code && form.release2Code && form.release1Code === form.release2Code) {
      errors.release2Code = "Release 2 must differ from Release 1";
    }
    if (!form.conflictingEnvironment) errors.conflictingEnvironment = "Conflicting environment is required";
    if (!form.environmentConflictType.trim()) errors.environmentConflictType = "Conflict type is required";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setFormError("Please fill in the required fields highlighted below.");
      return false;
    }
    setFormError(null);
    return true;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setFormError(null);
    const result = await safeFetchJson<CreatedConflict & { error?: string }>("/api/conflicts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: form.status,
        priority: form.priority,
        release1Code: form.release1Code,
        release2Code: form.release2Code,
        application: applicationName,
        department: departmentName,
        conflictingEnvironment: form.conflictingEnvironment,
        environmentConflictType: form.environmentConflictType.trim(),
        assignedTo: form.assignedTo.trim() || null,
        notes: form.notes.trim() || null,
      }),
      label: "create-conflict",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      setFormError(
        result.ok && result.data?.error ? result.data.error : "Failed to create conflict. Check the form and try again."
      );
      return;
    }
    onCreated();
    setCreated(result.data);
  };

  if (created) {
    return (
      <CreatedConfirmation
        title="Conflict created"
        subtitle="The conflict queue has been refreshed."
        labelledBy="conflict-created-title"
        onClose={onClose}
        onCreateAnother={() => {
          setCreated(null);
          setForm(emptyForm());
        }}
        viewHref={`/conflicts/${created.id}`}
        viewLabel="View Conflict"
        rows={[
          { label: "Conflict ID", value: created.conflictCode, mono: true },
          { label: "Status", value: created.status },
          { label: "Priority", value: created.priority },
          { label: "Release 1", value: created.release1Code, mono: true },
          { label: "Release 2", value: created.release2Code, mono: true },
          { label: "Application", value: created.application },
          { label: "Department", value: created.department },
          { label: "Environment", value: created.conflictingEnvironment },
          { label: "Conflict type", value: created.environmentConflictType },
        ]}
      />
    );
  }

  const dialog = (
    <ConflictModalFrame onClose={onClose} labelledBy="new-conflict-title">
      <div className="shrink-0 border-b border-gray-200 px-5 py-4 dark:border-[var(--border)]">
        <h2 id="new-conflict-title" className="text-lg font-semibold text-gray-900 dark:text-white">
          New Conflict
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-white/55">
          {scoped
            ? `${lockRelease1Code} vs another release. Conflict ID is assigned automatically.`
            : "Fields marked * are required. Conflict ID is generated by the server."}
        </p>
      </div>

      {formError ? <FormError message={formError} onDismiss={() => setFormError(null)} /> : null}

      <form
        id="conflict-create-form"
        onSubmit={submit}
        className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-5 py-4"
      >
        {scoped ? (
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600 dark:bg-white/5 dark:text-white/70">
            <p className="font-medium text-slate-800 dark:text-white">
              {release1 ? `${release1.releaseCode} — ${release1.name}` : lockRelease1Code}
            </p>
            <p className="mt-0.5">{[departmentName, applicationName].filter(Boolean).join(" · ") || "Loading…"}</p>
          </div>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectField
              label="Department"
              required
              value={form.departmentId}
              error={fieldErrors.departmentId}
              disabled={loadingLookups}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  departmentId: event.target.value,
                  applicationId: "",
                  conflictingEnvironment: "",
                }))
              }
            >
              <option value="">{loadingLookups ? "Loading…" : "Select department…"}</option>
              {departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Application"
              required
              value={form.applicationId}
              error={fieldErrors.applicationId}
              disabled={!form.departmentId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  applicationId: event.target.value,
                  conflictingEnvironment: "",
                }))
              }
            >
              <option value="">{form.departmentId ? "Select application…" : "Select department first…"}</option>
              {filteredApplications.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectField>
          </div>
        )}

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField
            label="Status"
            required
            value={form.status}
            error={fieldErrors.status}
            onChange={(event) => set("status", event.target.value)}
          >
            {statusSelectOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Priority"
            required
            value={form.priority}
            error={fieldErrors.priority}
            onChange={(event) => set("priority", event.target.value as FormValues["priority"])}
          >
            {CONFLICT_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
        </div>

        {!scoped ? (
          <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
            Release 1 <RequiredMark />
            <div className="mt-1">
              <SearchableSelect
                options={releases.map((item) => ({
                  value: item.releaseCode,
                  label: `${item.releaseCode} — ${item.name}`,
                }))}
                value={form.release1Code}
                onChange={(value) => {
                  setForm((current) => ({
                    ...current,
                    release1Code: value,
                    release2Code: current.release2Code === value ? "" : current.release2Code,
                  }));
                }}
                placeholder={loadingLookups ? "Loading…" : "Select release…"}
                disabled={loadingLookups}
                allowClear={false}
              />
            </div>
            {fieldErrors.release1Code ? (
              <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">{fieldErrors.release1Code}</p>
            ) : null}
          </label>
        ) : null}

        <label className="block min-w-0 text-xs font-medium text-gray-600 dark:text-white/70">
          {scoped ? "Conflicting release" : "Release 2"} <RequiredMark />
          <div className="mt-1">
            <SearchableSelect
              options={otherReleases.map((item) => ({
                value: item.releaseCode,
                label: `${item.releaseCode} — ${item.name}`,
              }))}
              value={form.release2Code}
              onChange={(value) => set("release2Code", value)}
              placeholder={loadingLookups ? "Loading…" : "Select the other release…"}
              disabled={loadingLookups || (!scoped && !form.release1Code)}
              allowClear={false}
            />
          </div>
          {fieldErrors.release2Code ? (
            <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">{fieldErrors.release2Code}</p>
          ) : null}
        </label>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField
            label="Conflicting environment"
            required
            value={form.conflictingEnvironment}
            error={fieldErrors.conflictingEnvironment}
            disabled={!form.applicationId}
            onChange={(event) => set("conflictingEnvironment", event.target.value)}
          >
            <option value="">{form.applicationId ? "Select environment…" : "Select application first…"}</option>
            {filteredEnvironments.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Conflict type"
            required
            value={form.environmentConflictType}
            error={fieldErrors.environmentConflictType}
            onChange={(event) => set("environmentConflictType", event.target.value)}
          >
            {typeOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
        </div>

        <TextField
          label="Assigned to"
          value={form.assignedTo}
          onChange={(event) => set("assignedTo", event.target.value)}
          maxLength={2000}
        />
        <TextareaField label="Notes" value={form.notes} onChange={(event) => set("notes", event.target.value)} />
      </form>

      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-[var(--border)]">
        <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="submit"
          form="conflict-create-form"
          className={taBtnPrimary}
          disabled={saving || loadingLookups}
        >
          {saving ? "Creating…" : "Create Conflict"}
        </button>
      </div>
    </ConflictModalFrame>
  );

  return createPortal(dialog, document.body);
}
