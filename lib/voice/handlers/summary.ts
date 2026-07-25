/**
 * get_summary tool handler — spoken answers about a specific entity.
 *
 * Client-side: validates args, then calls the read-only summary API which
 * reuses Conversation Agent DB access (`lookupReleaseByCode` + same Prisma
 * patterns in lib/conversation-entity-summary.ts). No mutations.
 */
import { SEARCH_ENTITY_TYPES } from "@/lib/search-entity-types";
import { safeFetchJson, isFetchAbort } from "@/lib/safe-fetch";

export type GetSummaryArgs = {
  entityType?: unknown;
  entityId?: unknown;
};

export type SummaryToolResult = {
  ok: boolean;
  tool: "get_summary";
  entityType?: string;
  entityId?: string;
  /** Concise natural-language summary for the model to speak. */
  summary?: string;
  instruction: string;
  actionLine: string;
  reason?: string;
};

type SummaryApiResponse = {
  ok: boolean;
  status?: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
  reason?: string;
};

/**
 * Fetch a spoken summary for one entity (search_entity id convention).
 * @param args - `{ entityType, entityId }` from Gemini.
 */
export async function handleGetSummary(args: GetSummaryArgs): Promise<SummaryToolResult> {
  const entityType =
    typeof args.entityType === "string" ? args.entityType.trim().toLowerCase() : "";
  const entityId = typeof args.entityId === "string" ? args.entityId.trim() : "";

  if (!entityType || !entityId) {
    return {
      ok: false,
      tool: "get_summary",
      instruction:
        "Ask which record to summarize, or call search_entity first to get entityType + entityId (use the path id segment or business code, not a bare invented id).",
      actionLine: "Summary failed — missing entityType or entityId",
      reason: "Missing entityType or entityId",
    };
  }

  if (!(SEARCH_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    return {
      ok: false,
      tool: "get_summary",
      entityType,
      entityId,
      instruction: `No summary available for entity type “${entityType}”. Supported types match search_entity.`,
      actionLine: `No summary for type ${entityType}`,
      reason: `Unsupported entityType: ${entityType}`,
    };
  }

  const api = await safeFetchJson<SummaryApiResponse>("/api/copilot/voice/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entityType, entityId }),
    label: "voice-get-summary",
  });

  if (isFetchAbort(api)) {
    return {
      ok: false,
      tool: "get_summary",
      entityType,
      entityId,
      instruction: "Summary request was cancelled. You can try again.",
      actionLine: "Summary cancelled",
      reason: "Aborted",
    };
  }

  if (!api.ok) {
    return {
      ok: false,
      tool: "get_summary",
      entityType,
      entityId,
      instruction:
        "Could not load the summary. Apologize briefly and offer to search_entity or try another record.",
      actionLine: "Summary failed — request error",
      reason: `HTTP ${api.status}`,
    };
  }

  const data = api.data;
  if (data.status === "not_found" || (!data.ok && data.reason?.toLowerCase().includes("not found"))) {
    return {
      ok: false,
      tool: "get_summary",
      entityType: data.entityType ?? entityType,
      entityId: data.entityId ?? entityId,
      instruction: `${data.reason ?? "Record not found"}. Offer to search_entity by name, or confirm the id.`,
      actionLine: `Not found — ${data.entityType ?? entityType} ${data.entityId ?? entityId}`,
      reason: data.reason ?? "Not found",
    };
  }

  if (data.status === "unsupported" || data.reason?.includes("No summary available")) {
    return {
      ok: false,
      tool: "get_summary",
      entityType: data.entityType ?? entityType,
      entityId: data.entityId ?? entityId,
      instruction: data.reason ?? "No summary available for this entity type.",
      actionLine: `No summary for type ${data.entityType ?? entityType}`,
      reason: data.reason ?? "Unsupported",
    };
  }

  if (!data.ok || !data.summary?.trim()) {
    return {
      ok: false,
      tool: "get_summary",
      entityType,
      entityId,
      instruction: data.reason ?? "Summary unavailable. Offer to open the record with navigate_to after search.",
      actionLine: "Summary unavailable",
      reason: data.reason ?? "Empty summary",
    };
  }

  return {
    ok: true,
    tool: "get_summary",
    entityType: data.entityType ?? entityType,
    entityId: data.entityId ?? entityId,
    summary: data.summary.trim(),
    instruction:
      "Speak the summary field naturally in a few sentences. Do not dump raw JSON. Only call navigate_to if the user then asks to open the record.",
    actionLine: `Summary: ${(data.entityType ?? entityType)} ${data.entityId ?? entityId}`,
  };
}
