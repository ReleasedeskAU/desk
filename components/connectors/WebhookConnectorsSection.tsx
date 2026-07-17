"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, Plus, RefreshCw } from "lucide-react";
import { safeFetchJson } from "@/lib/safe-fetch";
import { WebhookConnectorFormModal } from "@/components/connectors/WebhookConnectorFormModal";
import type { WebhookConnectorPublic, WebhookEventRow } from "@/lib/connectorEngineClient";

/**
 * Webhook connectors list + delivery log on the Connectors settings page.
 * Secrets are never listed here — only create returns the plaintext once.
 */
export function WebhookConnectorsSection() {
  const [rows, setRows] = useState<WebhookConnectorPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [eventsConnector, setEventsConnector] = useState<WebhookConnectorPublic | null>(null);
  const [events, setEvents] = useState<WebhookEventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [replayId, setReplayId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await safeFetchJson<WebhookConnectorPublic[] | { error?: string }>(
      "/api/webhook-connectors",
      { label: "list-webhook-connectors", rejectHttpErrors: false }
    );
    setLoading(false);
    if (!result.ok || result.status >= 300) {
      const body = result.ok ? (result.data as { error?: string }) : null;
      setError(body?.error ?? "Could not load webhook connectors (is connector-engine running?)");
      setRows([]);
      return;
    }
    setRows(result.data as WebhookConnectorPublic[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (row: WebhookConnectorPublic) => {
    setActionId(row.id);
    const result = await safeFetchJson(`/api/webhook-connectors/${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !row.active }),
      label: "toggle-webhook-connector",
      rejectHttpErrors: false,
    });
    setActionId(null);
    if (!result.ok || result.status >= 300) {
      setError("Failed to update webhook connector");
      return;
    }
    await load();
  };

  const openEvents = async (row: WebhookConnectorPublic) => {
    setEventsConnector(row);
    setEventsLoading(true);
    const result = await safeFetchJson<WebhookEventRow[]>(
      `/api/webhook-connectors/${encodeURIComponent(row.id)}/events`,
      { label: "list-webhook-events", rejectHttpErrors: false }
    );
    setEventsLoading(false);
    setEvents(result.ok && result.status < 300 ? result.data : []);
  };

  const replay = async (eventId: string) => {
    setReplayId(eventId);
    const result = await safeFetchJson(
      `/api/webhook-connectors/events/${encodeURIComponent(eventId)}/replay`,
      { method: "POST", label: "replay-webhook-event", rejectHttpErrors: false }
    );
    setReplayId(null);
    if (!result.ok || result.status >= 300) {
      setError("Replay failed");
      return;
    }
    if (eventsConnector) await openEvents(eventsConnector);
  };

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#111827] tracking-tight">Webhook Connectors</h2>
          <p className="mt-1 text-[14px] text-gray-500 font-medium leading-relaxed max-w-[640px]">
            Receive signed Jira events on the connector engine. Processing runs on the existing
            scheduler (no Redis queue). Secrets are shown once at create time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-[#2548C9] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#1E3A9F] transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Webhook
        </button>
      </div>

      {error ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading webhooks…
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-[12px] uppercase tracking-wide text-gray-500 font-semibold">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Provider</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Endpoint</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-gray-500">
                    No webhook connectors yet. Click &quot;Add Webhook&quot; to create one.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const busy = actionId === row.id;
                  return (
                    <tr key={row.id} className="hover:bg-gray-50/50">
                      <td className="border-b border-gray-200 px-5 py-4 font-semibold text-gray-900">
                        {row.name}
                      </td>
                      <td className="border-b border-gray-200 px-5 py-4 capitalize">{row.provider}</td>
                      <td className="border-b border-gray-200 px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            row.active
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {row.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="border-b border-gray-200 px-5 py-4">
                        <code className="break-all text-xs text-gray-600">{row.endpointUrl}</code>
                      </td>
                      <td className="border-b border-gray-200 px-5 py-4">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openEvents(row)}
                            className="text-gray-600 hover:text-gray-900 disabled:opacity-40"
                            title="Delivery log"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => toggleActive(row)}
                            className="text-xs font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-40"
                          >
                            {row.active ? "Disable" : "Enable"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      <WebhookConnectorFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          void load();
        }}
      />

      {eventsConnector ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30"
          onClick={() => setEventsConnector(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="webhook-events-title"
            className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 id="webhook-events-title" className="text-lg font-semibold text-gray-900">
                  Delivery log
                </h3>
                <p className="text-sm text-gray-500">{eventsConnector.name}</p>
              </div>
              <button
                type="button"
                className="text-sm font-semibold text-[#2548C9]"
                onClick={() => openEvents(eventsConnector)}
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              {eventsLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : events.length === 0 ? (
                <p className="text-sm text-gray-500">No deliveries yet.</p>
              ) : (
                <ul className="space-y-3">
                  {events.map((event) => (
                    <li
                      key={event.id}
                      className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            event.status === "processed"
                              ? "bg-emerald-50 text-emerald-800"
                              : event.status === "failed"
                                ? "bg-rose-50 text-rose-800"
                                : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {event.status}
                        </span>
                        <time className="text-xs text-gray-500">
                          {new Date(event.receivedAt).toLocaleString()}
                        </time>
                      </div>
                      <p className="mt-1 text-xs text-gray-700">{event.payloadPreview}</p>
                      {event.errorMessage ? (
                        <p className="mt-1 text-xs text-rose-600">{event.errorMessage}</p>
                      ) : null}
                      {event.status === "failed" ? (
                        <button
                          type="button"
                          disabled={replayId === event.id}
                          onClick={() => replay(event.id)}
                          className="mt-2 text-xs font-semibold text-[#2548C9] disabled:opacity-40"
                        >
                          {replayId === event.id ? "Replaying…" : "Replay"}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-gray-200 px-5 py-3">
              <button
                type="button"
                className="text-sm font-semibold text-gray-600"
                onClick={() => setEventsConnector(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
