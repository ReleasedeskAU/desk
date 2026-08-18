"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CreatedConfirmation,
  FormError,
  ModalFrame,
  RequiredMark,
  SelectField,
  TextField,
} from "@/components/forms/create-modal-primitives";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { useEntityLifecycleStatuses } from "@/hooks/useEntityLifecycleStatuses";
import {
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_STATUSES,
} from "@/lib/validation/incident";

type Application = { id: string; name: string };
type Environment = { id: string; name: string; applicationId: string };
type Release = { id: string; releaseCode: string; name: string };

const SEVERITIES = INCIDENT_SEVERITY_LABELS;
const IMPACTS = ["Down", "Degraded", "Partial"] as const;

type FormValues = {
  applicationId: string;
  environmentName: string;
  timestamp: string;
  severity: (typeof SEVERITIES)[number];
  title: string;
  status: string;
  impact: (typeof IMPACTS)[number];
  relatedReleaseCode: string;
  assignedTo: string;
};

type CreatedIncident = {
  id: string;
  incidentCode: string;
  timestamp: string;
  severity: string;
  title: string;
  status: string;
  impact: string;
  environmentName: string;
  assignedTo: string | null;
  application: { id: string; name: string };
  relatedRelease: { id: string; releaseCode: string; name: string } | null;
};

const nowLocal = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const emptyForm = (defaultStatus = "Active"): FormValues => ({
  applicationId: "",
  environmentName: "",
  timestamp: nowLocal(),
  severity: "P2 - High",
  title: "",
  status: defaultStatus,
  impact: "Degraded",
  relatedReleaseCode: "",
  assignedTo: "",
});

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** Enabled lifecycle status labels from parent (SSOT). */
  statusOptions?: string[];
  /** Enabled default status from incident lifecycle config. */
  defaultStatus?: string;
  /** When set, the incident is tied to this release code. */
  lockRelatedReleaseCode?: string;
  /** Prefill application when creating from a release page. */
  preferredApplicationId?: string;
};

/** Creates a validated incident; server generates incidentCode. */
export function IncidentFormModal({
  open,
  onClose,
  onCreated,
  statusOptions: statusOptionsProp,
  defaultStatus: defaultStatusProp,
  lockRelatedReleaseCode,
  preferredApplicationId,
}: Props) {
  const lifecycle = useEntityLifecycleStatuses("/api/incident-lifecycle-config");
  const defaultStatus =
    (defaultStatusProp && defaultStatusProp.trim()) ||
    lifecycle.defaultStatus ||
    "Open";
  const [form, setForm] = useState<FormValues>(() => emptyForm(defaultStatus));
  const [applications, setApplications] = useState<Application[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [created, setCreated] = useState<CreatedIncident | null>(null);

  const statusOptions = useMemo(() => {
    const base =
      statusOptionsProp && statusOptionsProp.length > 0
        ? statusOptionsProp
        : lifecycle.createOptions.length > 0
          ? lifecycle.createOptions
          : [...INCIDENT_STATUSES];
    return [...new Set([...base, form.status].filter(Boolean))];
  }, [form.status, lifecycle.createOptions, statusOptionsProp]);

  useEffect(() => {
    if (!open) return;
    setForm({
      ...emptyForm(defaultStatus),
      relatedReleaseCode: lockRelatedReleaseCode ?? "",
      applicationId: preferredApplicationId ?? "",
    });
    setCreated(null);
    setFormError(null);
    setFieldErrors({});
    setLoadingLookups(true);
    const ac = new AbortController();
    void (async () => {
      const [appResult, envResult, releaseResult] = await Promise.all([
        safeFetchJson<Application[]>("/api/applications", { signal: ac.signal, label: "incident-form-applications" }),
        safeFetchJson<Environment[]>("/api/environments", { signal: ac.signal, label: "incident-form-environments" }),
        safeFetchJson<Release[]>("/api/releases", { signal: ac.signal, label: "incident-form-releases" }),
      ]);
      if (ac.signal.aborted) return;
      setLoadingLookups(false);
      if (!appResult.ok || !envResult.ok || !releaseResult.ok) {
        setFormError("Could not load the form lookups. Close and try again.");
        return;
      }
      setApplications(appResult.data);
      setEnvironments(envResult.data);
      setReleases(releaseResult.data);
    })();
    return () => ac.abort();
  }, [open, defaultStatus]);

  const filteredEnvironments = useMemo(
    () => environments.filter((env) => env.applicationId === form.applicationId),
    [environments, form.applicationId]
  );

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
    if (!form.applicationId) errors.applicationId = "Application is required";
    if (!form.environmentName) errors.environmentName = "Environment is required";
    if (!form.timestamp) errors.timestamp = "Timestamp is required";
    if (!form.severity) errors.severity = "Severity is required";
    if (!form.title.trim()) errors.title = "Title is required";
    if (!form.status) errors.status = "Status is required";
    if (!form.impact) errors.impact = "Impact is required";
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
    const result = await safeFetchJson<CreatedIncident & { error?: string }>("/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: form.applicationId,
        environmentName: form.environmentName,
        timestamp: form.timestamp,
        severity: form.severity,
        title: form.title.trim(),
        status: form.status,
        impact: form.impact,
        relatedReleaseCode: form.relatedReleaseCode.trim() || null,
        assignedTo: form.assignedTo.trim() || null,
      }),
      label: "create-incident",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      setFormError(
        result.ok && result.data?.error ? result.data.error : "Failed to create incident. Check the form and try again."
      );
      return;
    }
    onCreated();
    setCreated(result.data);
  };

  if (created) {
    return (
      <CreatedConfirmation
        title="Incident created"
        subtitle="The incidents list has been refreshed."
        labelledBy="incident-created-title"
        onClose={onClose}
        onCreateAnother={() => {
          setCreated(null);
          setForm(emptyForm(defaultStatus));
        }}
        viewHref={`/incidents/${created.id}`}
        viewLabel="View Incident"
        rows={[
          { label: "Incident ID", value: created.incidentCode, mono: true },
          { label: "Title", value: created.title },
          { label: "Application", value: created.application.name },
          { label: "Environment", value: created.environmentName },
          { label: "Severity", value: created.severity },
          { label: "Status", value: created.status },
          { label: "Impact", value: created.impact },
        ]}
      />
    );
  }

  return (
    <ModalFrame onClose={onClose} labelledBy="new-incident-title" wide>
      <h2 id="new-incident-title" className="text-lg font-semibold text-gray-900 dark:text-white">
        New Incident
      </h2>
      <p className="mt-1 text-xs text-gray-500 dark:text-white/55">
        Fields marked <RequiredMark /> are required. Incident ID is generated by the server.
      </p>
      {formError ? <FormError message={formError} onDismiss={() => setFormError(null)} /> : null}
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Application"
          required
          value={form.applicationId}
          error={fieldErrors.applicationId}
          disabled={loadingLookups}
          onChange={(event) =>
            setForm((current) => ({ ...current, applicationId: event.target.value, environmentName: "" }))
          }
        >
          <option value="">{loadingLookups ? "Loading…" : "Select application…"}</option>
          {applications.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Environment"
          required
          value={form.environmentName}
          error={fieldErrors.environmentName}
          disabled={!form.applicationId}
          onChange={(event) => set("environmentName", event.target.value)}
        >
          <option value="">{form.applicationId ? "Select environment…" : "Select application first…"}</option>
          {filteredEnvironments.map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Timestamp"
          type="datetime-local"
          required
          value={form.timestamp}
          error={fieldErrors.timestamp}
          onChange={(event) => set("timestamp", event.target.value)}
        />
        <SelectField
          label="Severity"
          required
          value={form.severity}
          error={fieldErrors.severity}
          onChange={(event) => set("severity", event.target.value as FormValues["severity"])}
        >
          {SEVERITIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Title"
          required
          value={form.title}
          error={fieldErrors.title}
          maxLength={500}
          onChange={(event) => set("title", event.target.value)}
        />
        <SelectField
          label="Status"
          required
          value={form.status}
          error={fieldErrors.status}
          onChange={(event) => set("status", event.target.value)}
        >
          {statusOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Impact"
          required
          value={form.impact}
          error={fieldErrors.impact}
          onChange={(event) => set("impact", event.target.value as FormValues["impact"])}
        >
          {IMPACTS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Related release"
          value={form.relatedReleaseCode}
          disabled={Boolean(lockRelatedReleaseCode)}
          onChange={(event) => set("relatedReleaseCode", event.target.value)}
        >
          <option value="">None</option>
          {releases.map((item) => (
            <option key={item.id} value={item.releaseCode}>
              {item.releaseCode} — {item.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Assigned to"
          value={form.assignedTo}
          maxLength={4000}
          onChange={(event) => set("assignedTo", event.target.value)}
        />
        <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
          <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className={taBtnPrimary} disabled={saving || loadingLookups}>
            {saving ? "Creating…" : "Create Incident"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
