"use client";

import { useEffect, useState } from "react";
import {
  CreatedConfirmation,
  FormError,
  ModalFrame,
  RequiredMark,
  TextareaField,
  TextField,
} from "@/components/forms/create-modal-primitives";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { safeFetchJson } from "@/lib/safe-fetch";

type FormValues = {
  sourceSystem: string;
  targetSystem: string;
  integrationType: string;
  frequency: string;
  dataElements: string;
  businessPurpose: string;
};

type CreatedFlow = {
  id: string;
  flowCode: string;
  sourceSystem: string;
  targetSystem: string;
  integrationType: string;
  frequency: string;
  dataElements: string;
  businessPurpose: string;
};

const emptyForm = (): FormValues => ({
  sourceSystem: "",
  targetSystem: "",
  integrationType: "",
  frequency: "",
  dataElements: "",
  businessPurpose: "",
});

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  integrationTypeOptions?: string[];
  frequencyOptions?: string[];
};

/** Creates a validated integration flow; Flow ID is server-generated. */
export function IntegrationFlowFormModal({
  open,
  onClose,
  onCreated,
  integrationTypeOptions = [],
  frequencyOptions = [],
}: Props) {
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [created, setCreated] = useState<CreatedFlow | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm());
    setCreated(null);
    setFormError(null);
    setFieldErrors({});
  }, [open]);

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
    if (!form.sourceSystem.trim()) errors.sourceSystem = "Source system is required";
    if (!form.targetSystem.trim()) errors.targetSystem = "Target system is required";
    if (!form.integrationType.trim()) errors.integrationType = "Integration type is required";
    if (!form.frequency.trim()) errors.frequency = "Frequency is required";
    if (!form.dataElements.trim()) errors.dataElements = "Data elements are required";
    if (!form.businessPurpose.trim()) errors.businessPurpose = "Business purpose is required";
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
    const result = await safeFetchJson<CreatedFlow & { error?: string }>("/api/integration-flows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceSystem: form.sourceSystem.trim(),
        targetSystem: form.targetSystem.trim(),
        integrationType: form.integrationType.trim(),
        frequency: form.frequency.trim(),
        dataElements: form.dataElements.trim(),
        businessPurpose: form.businessPurpose.trim(),
      }),
      label: "create-integration-flow",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      setFormError(
        result.ok && result.data?.error
          ? result.data.error
          : "Failed to create integration flow. Check the form and try again."
      );
      return;
    }
    onCreated();
    setCreated(result.data);
  };

  if (created) {
    return (
      <CreatedConfirmation
        title="Integration flow created"
        subtitle="The integration flows list has been refreshed."
        labelledBy="integration-flow-created-title"
        onClose={onClose}
        onCreateAnother={() => {
          setCreated(null);
          setForm(emptyForm());
        }}
        viewHref={`/integration-flows/${created.id}`}
        viewLabel="View Flow"
        rows={[
          { label: "Flow ID", value: created.flowCode, mono: true },
          { label: "Source system", value: created.sourceSystem },
          { label: "Target system", value: created.targetSystem },
          { label: "Integration type", value: created.integrationType },
          { label: "Frequency", value: created.frequency },
          { label: "Data elements", value: created.dataElements },
          { label: "Business purpose", value: created.businessPurpose },
        ]}
      />
    );
  }

  return (
    <ModalFrame onClose={onClose} labelledBy="new-integration-flow-title" wide>
      <h2 id="new-integration-flow-title" className="text-lg font-semibold text-gray-900 dark:text-white">
        New Integration Flow
      </h2>
      <p className="mt-1 text-xs text-gray-500 dark:text-white/55">
        Fields marked <RequiredMark /> are required. Flow ID is generated by the server.
      </p>
      {formError ? <FormError message={formError} onDismiss={() => setFormError(null)} /> : null}
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <TextField
          label="Source system"
          required
          value={form.sourceSystem}
          error={fieldErrors.sourceSystem}
          onChange={(event) => set("sourceSystem", event.target.value)}
          maxLength={200}
        />
        <TextField
          label="Target system"
          required
          value={form.targetSystem}
          error={fieldErrors.targetSystem}
          onChange={(event) => set("targetSystem", event.target.value)}
          maxLength={200}
        />
        <TextField
          label="Integration type"
          required
          value={form.integrationType}
          error={fieldErrors.integrationType}
          onChange={(event) => set("integrationType", event.target.value)}
          list="integration-type-options"
          maxLength={120}
        />
        <datalist id="integration-type-options">
          {integrationTypeOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <TextField
          label="Frequency"
          required
          value={form.frequency}
          error={fieldErrors.frequency}
          onChange={(event) => set("frequency", event.target.value)}
          list="integration-frequency-options"
          maxLength={120}
        />
        <datalist id="integration-frequency-options">
          {frequencyOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <TextareaField
          label="Data elements"
          required
          value={form.dataElements}
          error={fieldErrors.dataElements}
          onChange={(event) => set("dataElements", event.target.value)}
        />
        <TextareaField
          label="Business purpose"
          required
          value={form.businessPurpose}
          error={fieldErrors.businessPurpose}
          onChange={(event) => set("businessPurpose", event.target.value)}
        />
        <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
          <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className={taBtnPrimary} disabled={saving}>
            {saving ? "Creating…" : "Create Flow"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
