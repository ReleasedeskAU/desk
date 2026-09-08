/**
 * Map StaffLess indexing-status + connector snapshots onto the System Connectors table.
 */

export type StafflessIndexingStatus = {
  cc_pair_id?: number;
  name?: string;
  source?: string;
  cc_pair_status?: string;
  in_progress?: boolean;
  last_status?: string | null;
  last_finished_status?: string | null;
  last_success?: string | null;
  docs_indexed?: number;
};

export type StafflessConnectorSnapshot = {
  id: number;
  name: string;
  source: string;
  credential_ids?: number[];
  connector_specific_config?: Record<string, unknown>;
  refresh_freq?: number | null;
  time_created?: string;
  time_updated?: string;
};

export type ConnectorTableRow = {
  id: string;
  ccPairId: number | null;
  name: string;
  type: string;
  authType: string;
  baseUrl: string | null;
  config: Record<string, unknown> | null;
  pollInterval: number;
  status: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  enabled: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

function sourceToType(source: string | undefined): string {
  return (source ?? "unknown").toLowerCase();
}

function authTypeFor(type: string): string {
  if (type === "jira" || type === "imap") return "basic_token";
  return "api_key";
}

function stringList(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const parts = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return parts.length > 0 ? parts.join(", ") : undefined;
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

/**
 * Translate StaffLess index attempt status into the existing badge keys.
 */
export function mapIndexingStatusToBadge(
  row: StafflessIndexingStatus
): { status: string; enabled: boolean; lastError: string | null } {
  const paused = (row.cc_pair_status ?? "").toUpperCase() === "PAUSED";
  if (paused) {
    return { status: "DISABLED", enabled: false, lastError: null };
  }
  if (row.in_progress || row.last_status === "in_progress") {
    return { status: "PENDING", enabled: true, lastError: null };
  }
  const finished = row.last_finished_status ?? row.last_status;
  if (finished === "failed") {
    return { status: "ERROR", enabled: true, lastError: "Last index run failed" };
  }
  if (finished === "success" || finished === "completed_with_errors") {
    return { status: "CONNECTED", enabled: true, lastError: null };
  }
  return { status: "PENDING", enabled: true, lastError: null };
}

export function mapConnectorToTableRow(
  connector: StafflessConnectorSnapshot,
  status: StafflessIndexingStatus | undefined
): ConnectorTableRow {
  const badge = mapIndexingStatusToBadge(status ?? {});
  const cfg = connector.connector_specific_config ?? {};
  const type = sourceToType(connector.source);
  const host = typeof cfg.host === "string" ? cfg.host : undefined;
  const baseUrl =
    typeof cfg.jira_base_url === "string"
      ? cfg.jira_base_url
      : typeof cfg.github_base_url === "string"
        ? cfg.github_base_url
        : host ?? null;
  const projectKey = typeof cfg.project_key === "string" ? cfg.project_key : undefined;
  const repoOwner = typeof cfg.repo_owner === "string" ? cfg.repo_owner : "";
  const repositories = typeof cfg.repositories === "string" ? cfg.repositories : "";
  const repo =
    repoOwner && repositories
      ? repositories.includes("/")
        ? repositories
        : `${repoOwner}/${repositories}`
      : repositories || undefined;
  const teamNames = stringList(cfg.teams);
  const mailboxes = stringList(cfg.mailboxes);
  const port =
    typeof cfg.port === "number"
      ? String(cfg.port)
      : typeof cfg.port === "string" && cfg.port.trim()
        ? cfg.port.trim()
        : undefined;

  return {
    id: String(connector.id),
    ccPairId: status?.cc_pair_id ?? null,
    name: connector.name,
    type,
    authType: authTypeFor(type),
    baseUrl,
    config: {
      ...(projectKey ? { projectKey } : {}),
      ...(repo ? { repo } : {}),
      ...(teamNames ? { teamNames } : {}),
      ...(host ? { host } : {}),
      ...(port ? { port } : {}),
      ...(mailboxes ? { mailboxes } : {}),
    },
    pollInterval: connector.refresh_freq ? Math.max(1, Math.round(connector.refresh_freq / 60)) : 15,
    status: badge.status,
    lastSyncedAt: status?.last_success ?? null,
    lastError: badge.lastError,
    enabled: badge.enabled,
    createdBy: null,
    createdAt: connector.time_created ?? new Date(0).toISOString(),
    updatedAt: connector.time_updated ?? connector.time_created ?? new Date(0).toISOString(),
  };
}

/**
 * indexing-status returns one group per source, each with indexing_statuses[].
 */
export function flattenIndexingStatusPayload(payload: unknown): StafflessIndexingStatus[] {
  if (!Array.isArray(payload)) return [];
  const out: StafflessIndexingStatus[] = [];
  for (const group of payload) {
    if (!group || typeof group !== "object") continue;
    const rows = (group as { indexing_statuses?: unknown }).indexing_statuses;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (row && typeof row === "object") out.push(row as StafflessIndexingStatus);
    }
  }
  return out;
}

export function mergeConnectorsWithStatus(
  connectors: StafflessConnectorSnapshot[],
  statuses: StafflessIndexingStatus[]
): ConnectorTableRow[] {
  return connectors.map((connector) => {
    const match =
      statuses.find((s) => s.name === connector.name && sourceToType(s.source) === sourceToType(connector.source)) ??
      statuses.find((s) => s.name === connector.name);
    return mapConnectorToTableRow(connector, match);
  });
}
