/**
 * StaffLess AI connector + document operations used by Sentinel API routes.
 */

import { stafflessFetch } from "@/lib/staffless/client";
import { planStafflessCreate, type WizardCreateInput } from "@/lib/staffless/create-payload";
import {
  flattenIndexingStatusPayload,
  mergeConnectorsWithStatus,
  type ConnectorTableRow,
  type StafflessConnectorSnapshot,
} from "@/lib/staffless/map-indexing-status";
import {
  mapSearchDocsToWorkItems,
  type StafflessSearchDoc,
  type WorkItemRow,
} from "@/lib/staffless/map-search-docs";

type IdResponse = { id?: number };

export async function listStafflessConnectors(): Promise<ConnectorTableRow[]> {
  const [connectors, statusPayload] = await Promise.all([
    stafflessFetch<StafflessConnectorSnapshot[]>("/api/manage/admin/connector"),
    stafflessFetch<unknown>("/api/manage/admin/connector/indexing-status", {
      json: { get_all_connectors: true },
    }),
  ]);
  const list = Array.isArray(connectors) ? connectors : [];
  return mergeConnectorsWithStatus(list, flattenIndexingStatusPayload(statusPayload));
}

export async function refreshStafflessConnectorStatus(): Promise<ConnectorTableRow[]> {
  return listStafflessConnectors();
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

export async function runStafflessConnectorOnce(connectorId: number): Promise<void> {
  await stafflessFetch("/api/manage/admin/connector/run-once", {
    json: { connector_id: connectorId, from_beginning: false },
  });
}

export async function searchStafflessWorkItems(query: string, source?: string): Promise<WorkItemRow[]> {
  const filters: Record<string, unknown> = {};
  if (source) filters.source_type = [source.toLowerCase()];
  const body = await stafflessFetch<{ documents?: StafflessSearchDoc[] }>("/api/admin/search", {
    json: { query: query.trim(), filters },
  });
  return mapSearchDocsToWorkItems(body?.documents ?? []);
}
