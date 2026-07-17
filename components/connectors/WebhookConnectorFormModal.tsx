"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, Copy, Check } from "lucide-react";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { safeFetchJson } from "@/lib/safe-fetch";
import { JIRA_WEBHOOK_EVENTS } from "@/lib/validation/webhook-connector";

type Created = {
  id: string;
  name: string;
  provider: string;
  endpointUrl: string;
  secret: string;
  events: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

const emptyForm = () => ({
  name: "",
  provider: "jira" as const,
  baseUrl: "",
  events: [...JIRA_WEBHOOK_EVENTS] as string[],
});

/**
 * Creates a webhook connector via /api/webhook-connectors and shows a
 * one-time secret + endpoint confirmation (Booking/Risk create pattern).
 */
export function WebhookConnectorFormModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState<"url" | "secret" | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm());
    setError(null);
    setCreated(null);
    setCopied(null);
  }, [open]);

  if (!open) return null;

  const copy = async (kind: "url" | "secret", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  };

  const toggleEvent = (event: string) => {
    setForm((current) => ({
      ...current,
      events: current.events.includes(event)
        ? current.events.filter((item) => item !== event)
        : [...current.events, event],
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!form.events.length) {
      setError("Select at least one event");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await safeFetchJson<Created & { error?: string }>("/api/webhook-connectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        provider: form.provider,
        baseUrl: form.baseUrl.trim() || null,
        events: form.events,
      }),
      label: "create-webhook-connector",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      setError(
        result.ok && result.data?.error
          ? result.data.error
          : "Failed to create webhook connector"
      );
      return;
    }
    onCreated();
    setCreated(result.data);
  };

  if (created) {
    return (
      <ModalFrame onClose={onClose} labelledBy="webhook-created-title" wide>
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id="webhook-created-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              Webhook connector created
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-white/60">
              Copy the endpoint URL and secret into Jira now — the secret is shown only once.
            </p>
          </div>
        </div>

        <dl className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm dark:border-[var(--border)] dark:bg-white/5">
          <Row label="Name" value={created.name} />
          <Row label="Provider" value={created.provider} />
          <CopyRow
            label="Endpoint URL"
            value={created.endpointUrl}
            copied={copied === "url"}
            onCopy={() => copy("url", created.endpointUrl)}
          />
          <CopyRow
            label="Secret (once)"
            value={created.secret}
            copied={copied === "secret"}
            onCopy={() => copy("secret", created.secret)}
            mono
          />
          <Row label="Events" value={created.events.join(", ")} />
        </dl>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          In Jira: Settings → System → WebHooks → Create. Paste the URL, enable the events above,
          and set the secret for HMAC signing (`X-Hub-Signature-256`).
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className={taBtnSecondary}
            onClick={() => {
              setCreated(null);
              setForm(emptyForm());
            }}
          >
            Create another
          </button>
          <button type="button" className={taBtnPrimary} onClick={onClose}>
            Close
          </button>
        </div>
      </ModalFrame>
    );
  }

  return (
    <ModalFrame onClose={onClose} labelledBy="new-webhook-title" wide>
      <h2 id="new-webhook-title" className="text-lg font-semibold text-gray-900 dark:text-white">
        Add Webhook Connector
      </h2>
      <p className="mt-1 text-xs text-gray-500 dark:text-white/55">
        Endpoint token and signing secret are generated by the connector engine. Secrets are never
        stored in the browser after you close this dialog.
      </p>
      {error ? (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : null}
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-gray-600 dark:text-white/70 sm:col-span-2">
          Name <span className="text-rose-500">*</span>
          <input
            className={cn(taInput, "mt-1")}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Jira production webhooks"
            maxLength={200}
          />
        </label>
        <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
          Provider
          <select
            className={cn(taInput, "mt-1")}
            value={form.provider}
            onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as "jira" }))}
          >
            <option value="jira">Jira</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
          Jira base URL (optional)
          <input
            className={cn(taInput, "mt-1")}
            value={form.baseUrl}
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
            placeholder="https://your-domain.atlassian.net"
          />
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="text-xs font-medium text-gray-600 dark:text-white/70">
            Events <span className="text-rose-500">*</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {JIRA_WEBHOOK_EVENTS.map((event) => (
              <label
                key={event}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs",
                  form.events.includes(event)
                    ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-200"
                    : "border-gray-200 text-gray-600 dark:border-[var(--border)] dark:text-white/70"
                )}
              >
                <input
                  type="checkbox"
                  className="accent-[var(--brand)]"
                  checked={form.events.includes(event)}
                  onChange={() => toggleEvent(event)}
                />
                {event}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2 mt-2 flex justify-end gap-2">
          <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className={taBtnPrimary} disabled={saving}>
            {saving ? "Creating…" : "Create webhook connector"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function ModalFrame({
  children,
  onClose,
  labelledBy,
  wide,
}: {
  children: ReactNode;
  onClose: () => void;
  labelledBy: string;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-theme-lg dark:bg-[var(--card)]",
          wide ? "max-w-2xl" : "max-w-lg"
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500 dark:text-white/55">{label}</dt>
      <dd className="max-w-[70%] text-right font-medium text-gray-900 dark:text-white">{value}</dd>
    </div>
  );
}

function CopyRow({
  label,
  value,
  onCopy,
  copied,
  mono,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <dt className="text-gray-500 dark:text-white/55">{label}</dt>
        <button
          type="button"
          onClick={onCopy}
          className={cn(taBtnSecondary, "inline-flex items-center gap-1 px-2 py-1 text-xs")}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <dd
        className={cn(
          "break-all rounded-lg bg-white px-2 py-1.5 text-xs text-gray-800 dark:bg-black/20 dark:text-white/90",
          mono && "font-mono"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
