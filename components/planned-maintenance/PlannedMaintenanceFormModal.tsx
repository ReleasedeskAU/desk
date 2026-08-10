"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CreatedConfirmation,
  FormError,
  ModalFrame,
  RequiredMark,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/forms/create-modal-primitives";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { safeFetchJson } from "@/lib/safe-fetch";

type Application = { id: string; name: string };
type Environment = { id: string; name: string; applicationId: string };

const TYPES = [
  "Scheduled Outage",
  "DB Refresh",
  "Patch Window",
  "Vendor Maintenance",
  "Infrastructure",
] as const;

const IMPACTS = ["Full Outage", "Partial", "Read-Only"] as const;

const APPROVAL_STATUSES = [
  "Pending",
  "Scheduled",
  "Approved",
  "In Progress",
  "Completed",
  "Cancelled",
  "Rejected",
] as const;

type FormValues = {
  scheduledDate: string;
  startTime: string;
  endTime: string;
  type: (typeof TYPES)[number];
  applicationId: string;
  environmentName: string;
  impact: (typeof IMPACTS)[number];
  approvalStatus: (typeof APPROVAL_STATUSES)[number];
  requestor: string;
  notes: string;
};

type CreatedMaintenance = {
  id: string;
  maintenanceCode: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  type: string;
  environmentName: string;
  impact: string;
  approvalStatus: string;
  requestor: string | null;
  application: { id: string; name: string } | null;
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): FormValues => ({
  scheduledDate: today(),
  startTime: "18:00",
  endTime: "22:00",
  type: "Scheduled Outage",
  applicationId: "",
  environmentName: "",
  impact: "Full Outage",
  approvalStatus: "Pending",
  requestor: "",
  notes: "",
});

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

/** Creates a planned maintenance window; server generates maintenanceCode. */
export function PlannedMaintenanceFormModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [applications, setApplications] = useState<Application[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [created, setCreated] = useState<CreatedMaintenance | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm());
    setCreated(null);
    setFormError(null);
    setFieldErrors({});
    setLoadingLookups(true);
    const ac = new AbortController();
    void (async () => {
      const [appResult, envResult] = await Promise.all([
        safeFetchJson<Application[]>("/api/applications", { signal: ac.signal, label: "maintenance-form-applications" }),
        safeFetchJson<Environment[]>("/api/environments", { signal: ac.signal, label: "maintenance-form-environments" }),
      ]);
      if (ac.signal.aborted) return;
      setLoadingLookups(false);
      if (!appResult.ok || !envResult.ok) {
        setFormError("Could not load the form lookups. Close and try again.");
        return;
      }
      setApplications(appResult.data);
      setEnvironments(envResult.data);
    })();
    return () => ac.abort();
  }, [open]);

  const filteredEnvironments = useMemo(() => {
    if (!form.applicationId) return environments;
    return environments.filter((env) => env.applicationId === form.applicationId);
  }, [environments, form.applicationId]);

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
    if (!form.scheduledDate) errors.scheduledDate = "Scheduled date is required";
    if (!form.startTime) errors.startTime = "Start time is required";
    if (!form.endTime) errors.endTime = "End time is required";
    if (!form.type) errors.type = "Type is required";
    if (!form.environmentName) errors.environmentName = "Environment is required";
    if (!form.impact) errors.impact = "Impact is required";
    if (!form.approvalStatus) errors.approvalStatus = "Approval status is required";
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
    const result = await safeFetchJson<CreatedMaintenance & { error?: string }>("/api/planned-maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduledDate: form.scheduledDate,
        startTime: form.startTime,
        endTime: form.endTime,
        type: form.type,
        applicationId: form.applicationId || null,
        environmentName: form.environmentName,
        impact: form.impact,
        approvalStatus: form.approvalStatus,
        requestor: form.requestor.trim() || null,
        notes: form.notes.trim() || null,
      }),
      label: "create-planned-maintenance",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      setFormError(
        result.ok && result.data?.error
          ? result.data.error
          : "Failed to create maintenance window. Check the form and try again."
      );
      return;
    }
    onCreated();
    setCreated(result.data);
  };

  if (created) {
    return (
      <CreatedConfirmation
        title="Maintenance window created"
        subtitle="The planned maintenance list has been refreshed."
        labelledBy="maintenance-created-title"
        onClose={onClose}
        onCreateAnother={() => {
          setCreated(null);
          setForm(emptyForm());
        }}
        viewHref={`/planned-maintenance/${created.id}`}
        viewLabel="View Maintenance"
        rows={[
          { label: "Maintenance ID", value: created.maintenanceCode, mono: true },
          { label: "Type", value: created.type },
          { label: "Application", value: created.application?.name ?? "—" },
          { label: "Environment", value: created.environmentName },
          { label: "Impact", value: created.impact },
          { label: "Approval", value: created.approvalStatus },
        ]}
      />
    );
  }

  return (
    <ModalFrame onClose={onClose} labelledBy="new-maintenance-title" wide>
      <h2 id="new-maintenance-title" className="text-lg font-semibold text-gray-900 dark:text-white">
        New Planned Maintenance
      </h2>
      <p className="mt-1 text-xs text-gray-500 dark:text-white/55">
        Fields marked <RequiredMark /> are required. Maintenance ID is generated by the server.
      </p>
      {formError ? <FormError message={formError} onDismiss={() => setFormError(null)} /> : null}
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <TextField
          label="Scheduled date"
          type="date"
          required
          value={form.scheduledDate}
          error={fieldErrors.scheduledDate}
          onChange={(event) => set("scheduledDate", event.target.value)}
        />
        <SelectField
          label="Type"
          required
          value={form.type}
          error={fieldErrors.type}
          onChange={(event) => set("type", event.target.value as FormValues["type"])}
        >
          {TYPES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Start time"
          type="time"
          required
          value={form.startTime}
          error={fieldErrors.startTime}
          onChange={(event) => set("startTime", event.target.value)}
        />
        <TextField
          label="End time"
          type="time"
          required
          value={form.endTime}
          error={fieldErrors.endTime}
          onChange={(event) => set("endTime", event.target.value)}
        />
        <SelectField
          label="Application"
          value={form.applicationId}
          disabled={loadingLookups}
          onChange={(event) =>
            setForm((current) => ({ ...current, applicationId: event.target.value, environmentName: "" }))
          }
        >
          <option value="">{loadingLookups ? "Loading…" : "None (optional)"}</option>
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
          disabled={loadingLookups}
          onChange={(event) => set("environmentName", event.target.value)}
        >
          <option value="">{loadingLookups ? "Loading…" : "Select environment…"}</option>
          {filteredEnvironments.map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
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
          label="Approval status"
          required
          value={form.approvalStatus}
          error={fieldErrors.approvalStatus}
          onChange={(event) => set("approvalStatus", event.target.value as FormValues["approvalStatus"])}
        >
          {APPROVAL_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Requestor"
          value={form.requestor}
          maxLength={4000}
          onChange={(event) => set("requestor", event.target.value)}
        />
        <TextareaField
          label="Notes"
          value={form.notes}
          onChange={(event) => set("notes", event.target.value)}
        />
        <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
          <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className={taBtnPrimary} disabled={saving || loadingLookups}>
            {saving ? "Creating…" : "Create Maintenance"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
