/**
 * StaffLess AI connector + document operations used by Sentinel API routes.
 */

import { stafflessFetch } from "@/lib/staffless/client";
import {
  isStafflessConnectorType,
  planStafflessConnector,
  planStafflessCreate,
  type WizardConnectorInput,
  type WizardCreateInput,
} from "@/lib/staffless/create-payload";
import { findRowByStafflessId, requireCcPairId, requireSingleCredentialId, StafflessIdError } from "@/lib/staffless/ids";
import { mapIndexAttemptPage, mapIndexErrorPage } from "@/lib/staffless/map-index-attempts";
import { buildSyncLogsView, type SyncLogsView } from "@/lib/staffless/map-sync-logs";
import {
  flattenIndexingStatusPayload,
  mergeCcPairsWithIndexingStatus,
  type ConnectorTableRow,
  type StafflessCcPairStatus,
} from "@/lib/staffless/map-indexing-status";
import {
  mapSearchDocsToWorkItems,
  type StafflessSearchDoc,
  type WorkItemRow,
} from "@/lib/staffless/map-search-docs";

type IdResponse = { id?: number };

export { isStafflessConnectorType, StafflessIdError };

/**
 * List cc-pairs from GET /admin/connector/status, joined to indexing-status by cc_pair_id.
 * Credential JSON from the status payload is not copied onto the row.
 */
export async function listStafflessConnectors(): Promise<ConnectorTableRow[]> {
  const [pairs, statusPayload] = await Promise.all([
    stafflessFetch<StafflessCcPairStatus[]>("/api/manage/admin/connector/status"),
    stafflessFetch<unknown>("/api/manage/admin/connector/indexing-status", {
      json: { get_all_connectors: true },
    }),
  ]);
  return mergeCcPairsWithIndexingStatus(Array.isArray(pairs) ? pairs : [], flattenIndexingStatusPayload(statusPayload));
}

export async function refreshStafflessConnectorStatus(): Promise<ConnectorTableRow[]> {
  return listStafflessConnectors();
}

export async function findStafflessConnector(id: string): Promise<ConnectorTableRow | null> {
  const rows = await listStafflessConnectors();
  return findRowByStafflessId(rows, id);
}

export async function createStafflessConnector(input: WizardCreateInput): Promise<{ id: number }> {
  const plan = planStafflessCreate(input);
  const credential = await stafflessFetch<IdResponse>("/api/manage/credential", {
    json: plan.credential,
  });
  const connector = await stafflessFetch<IdResponse>("/api/manage/admin/connector", {
    json: plan.connector,
  });
  const credentialId = credential?.id;
  const connectorId = connector?.id;
  if (credentialId == null || connectorId == null) {
    throw new Error("StaffLess AI did not return connector ids");
  }
  await stafflessFetch(`/api/manage/connector/${connectorId}/credential/${credentialId}`, {
    method: "PUT",
    json: { name: input.name, access_type: "public", groups: [] },
  });
  return { id: connectorId };
}

export type StafflessUpdateInput = WizardConnectorInput & {
  credentials?: Record<string, string>;
};

/**
 * PATCH connector config, optionally PUT credentials, and rename the cc-pair.
 * @throws StafflessIdError when the pair or credential cannot be resolved.
 */
export async function updateStafflessConnector(row: ConnectorTableRow, input: StafflessUpdateInput): Promise<void> {
  const connectorId = Number(row.id);
  const ccPairId = requireCcPairId(row.ccPairId);
  const connector = planStafflessConnector({ ...input, type: row.type });
  await stafflessFetch(`/api/manage/admin/connector/${connectorId}`, {
    method: "PATCH",
    json: connector,
  });
  if (input.name.trim()) {
    await stafflessFetch(`/api/manage/admin/cc-pair/${ccPairId}/name?new_name=${encodeURIComponent(input.name.trim())}`, {
      method: "PUT",
    });
  }
  if (input.credentials && Object.keys(input.credentials).length > 0) {
    const credentialId = requireSingleCredentialId(row.credentialIds);
    const plan = planStafflessCreate({
      name: input.name,
      type: row.type,
      baseUrl: input.baseUrl,
      config: input.config,
      pollInterval: input.pollInterval,
      credentials: input.credentials,
    });
    await stafflessFetch(`/api/manage/admin/credential/${credentialId}`, {
      method: "PUT",
      json: { name: plan.credential.name, credential_json: plan.credential.credential_json },
    });
  }
}

export async function setStafflessConnectorPaused(row: ConnectorTableRow, paused: boolean): Promise<void> {
  const ccPairId = requireCcPairId(row.ccPairId);
  await stafflessFetch(`/api/manage/admin/cc-pair/${ccPairId}/status`, {
    method: "PUT",
    json: { status: paused ? "PAUSED" : "ACTIVE" },
  });
}

/**
 * Schedule document + pair deletion. Indexed copies are removed; the source system is not.
 * @throws StafflessIdError when credential id is missing or ambiguous.
 */
export async function deleteStafflessConnector(row: ConnectorTableRow): Promise<void> {
  const credentialId = requireSingleCredentialId(row.credentialIds);
  await stafflessFetch("/api/manage/admin/deletion-attempt", {
    json: { connector_id: Number(row.id), credential_id: credentialId },
  });
}

export async function runStafflessConnectorOnce(connectorId: number, fromBeginning = false): Promise<void> {
  await stafflessFetch("/api/manage/admin/connector/run-once", {
    json: { connector_id: connectorId, from_beginning: fromBeginning },
  });
}

export async function pruneStafflessConnector(row: ConnectorTableRow): Promise<void> {
  const ccPairId = requireCcPairId(row.ccPairId);
  await stafflessFetch(`/api/manage/admin/cc-pair/${ccPairId}/prune`, { method: "POST" });
}

/** Index attempts for this cc-pair. Newest first. @throws StafflessIdError when unbound. */
export async function listStafflessIndexAttempts(row: ConnectorTableRow) {
  const ccPairId = requireCcPairId(row.ccPairId);
  const payload = await stafflessFetch<unknown>(
    `/api/manage/admin/cc-pair/${ccPairId}/index-attempts?page_num=0&page_size=50`
  );
  return mapIndexAttemptPage(payload);
}

/** Unresolved index errors for this cc-pair. @throws StafflessIdError when unbound. */
export async function listStafflessIndexErrors(row: ConnectorTableRow) {
  const ccPairId = requireCcPairId(row.ccPairId);
  const payload = await stafflessFetch<unknown>(
    `/api/manage/admin/cc-pair/${ccPairId}/errors?include_resolved=false&page_num=0&page_size=50`
  );
  return mapIndexErrorPage(payload);
}

/**
 * Indexing-status plus attempts and unresolved errors for the sync-logs drawer.
 * @throws StafflessIdError when the cc-pair is missing.
 */
export async function listStafflessSyncLogs(row: ConnectorTableRow): Promise<SyncLogsView> {
  const [attempts, errors] = await Promise.all([listStafflessIndexAttempts(row), listStafflessIndexErrors(row)]);
  return buildSyncLogsView({ connector: row, attempts, errors });
}

export async function searchStafflessWorkItems(query: string, source?: string): Promise<WorkItemRow[]> {
  const filters: Record<string, unknown> = {};
  if (source) filters.source_type = [source.toLowerCase()];
  const body = await stafflessFetch<{ documents?: StafflessSearchDoc[] }>("/api/admin/search", {
    json: { query: query.trim(), filters },
  });
  return mapSearchDocsToWorkItems(body?.documents ?? []);
}
