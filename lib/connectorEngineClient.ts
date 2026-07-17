const DEFAULT_URL = "http://localhost:3100";

type EngineConfig = {
  baseUrl: string;
  apiKey: string;
};

function getEngineConfig(): EngineConfig {
  const baseUrl = (process.env.CONNECTOR_ENGINE_URL ?? DEFAULT_URL).replace(/\/$/, "");
  const apiKey = process.env.CONNECTOR_ENGINE_API_KEY;
  if (!apiKey) {
    throw new Error("CONNECTOR_ENGINE_API_KEY is not set");
  }
  return { baseUrl, apiKey };
}

async function engineFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { baseUrl, apiKey } = getEngineConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(init?.headers ?? {}),
    },
  });

  const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) {
    throw new Error(data.error ?? data.message ?? `Connector engine error (${res.status})`);
  }
  return data;
}

export async function testConnectorConnection(input: {
  type: string;
  authType: string;
  baseUrl?: string | null;
  credentials: Record<string, string>;
  config?: Record<string, unknown> | null;
}): Promise<{ ok: boolean; message?: string }> {
  return engineFetch("/internal/connectors/test", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function testConnectorById(id: string): Promise<{ ok: boolean; message?: string }> {
  return engineFetch(`/internal/connectors/${encodeURIComponent(id)}/test`, {
    method: "POST",
  });
}

export async function syncConnectorById(id: string): Promise<{
  ok: boolean;
  status?: string;
  lastSyncedAt?: Date | string | null;
  lastError?: string | null;
}> {
  return engineFetch(`/internal/connectors/${encodeURIComponent(id)}/sync`, {
    method: "POST",
  });
}

export type WebhookConnectorPublic = {
  id: string;
  name: string;
  provider: string;
  baseUrl: string | null;
  events: string[];
  active: boolean;
  endpointToken: string;
  endpointUrl: string;
  createdAt: string | Date;
  updatedAt?: string | Date;
};

export type CreatedWebhookConnector = WebhookConnectorPublic & {
  /** Plaintext secret — returned once on create; never persist in Sentinel. */
  secret: string;
};

export type WebhookEventRow = {
  id: string;
  status: string;
  errorMessage: string | null;
  retryCount: number;
  receivedAt: string | Date;
  processedAt: string | Date | null;
  payloadPreview: string;
};

/** Creates a webhook connector via connector-engine (secret encrypted server-side). */
export async function createWebhookConnector(input: {
  provider: "jira" | "github";
  name: string;
  baseUrl?: string | null;
  events: string[];
  active?: boolean;
}): Promise<CreatedWebhookConnector> {
  return engineFetch("/internal/webhooks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listWebhookConnectors(): Promise<WebhookConnectorPublic[]> {
  return engineFetch("/internal/webhooks", { method: "GET" });
}

export async function patchWebhookConnector(
  id: string,
  input: { name?: string; active?: boolean; events?: string[]; baseUrl?: string | null }
): Promise<WebhookConnectorPublic> {
  return engineFetch(`/internal/webhooks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function listWebhookEvents(connectorId: string): Promise<WebhookEventRow[]> {
  return engineFetch(`/internal/webhooks/${encodeURIComponent(connectorId)}/events`, {
    method: "GET",
  });
}

export async function replayWebhookEvent(eventId: string): Promise<{
  ok: boolean;
  event?: { id: string; status: string; errorMessage: string | null };
}> {
  return engineFetch(`/internal/webhooks/events/${encodeURIComponent(eventId)}/replay`, {
    method: "POST",
  });
}
