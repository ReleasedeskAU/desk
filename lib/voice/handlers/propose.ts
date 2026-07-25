/**
 * propose_action client handler — stages a write; never mutates.
 */
import { safeFetchJson, isFetchAbort } from "@/lib/safe-fetch";

export type ProposeActionArgs = {
  actionType?: unknown;
  params?: unknown;
};

export type ProposeToolResult = {
  ok: boolean;
  tool: "propose_action";
  actionType?: string;
  actionId?: string;
  description?: string;
  instruction: string;
  actionLine: string;
  reason?: string;
  transcriptRole?: "propose";
};

/**
 * Propose a voice write (validation + staging only).
 * @param args - Model args.
 * @param dispatchId - Current Live toolCall batch id (two-turn gate).
 */
export async function handleProposeAction(
  args: ProposeActionArgs,
  dispatchId: string
): Promise<ProposeToolResult> {
  const actionType = typeof args.actionType === "string" ? args.actionType.trim() : "";
  const params =
    args.params && typeof args.params === "object" && !Array.isArray(args.params)
      ? (args.params as Record<string, unknown>)
      : null;

  if (!actionType || !params) {
    return {
      ok: false,
      tool: "propose_action",
      instruction: "Need actionType and params. Allowed: set_approval_decision, acknowledge_alert.",
      actionLine: "Propose failed — missing actionType or params",
      reason: "Missing actionType or params",
    };
  }

  const api = await safeFetchJson<ProposeToolResult>("/api/copilot/voice/propose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actionType, params, dispatchId }),
    label: "voice-propose",
    rejectHttpErrors: false,
  });

  if (isFetchAbort(api)) {
    return {
      ok: false,
      tool: "propose_action",
      instruction: "Propose was cancelled.",
      actionLine: "Propose cancelled",
      reason: "Aborted",
    };
  }

  if (!api.ok) {
    return {
      ok: false,
      tool: "propose_action",
      instruction: "Could not stage the proposal. Apologize and retry or use the UI.",
      actionLine: "Propose failed — request error",
      reason: `HTTP ${api.status}`,
    };
  }

  return {
    ...api.data,
    tool: "propose_action",
    transcriptRole: api.data.ok ? "propose" : undefined,
  };
}
