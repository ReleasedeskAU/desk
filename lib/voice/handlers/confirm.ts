/**
 * confirm_action client handler — executes staged write via real PATCH, or discards.
 */
import { safeFetchJson, isFetchAbort } from "@/lib/safe-fetch";

export type ConfirmActionArgs = {
  actionId?: unknown;
  /** false = verbal no/cancel. Default true. */
  accept?: unknown;
};

export type ConfirmToolResult = {
  ok: boolean;
  tool: "confirm_action";
  actionType?: string;
  description?: string;
  resultSummary?: string;
  instruction: string;
  actionLine: string;
  reason?: string;
  discarded?: boolean;
};

/**
 * Confirm or discard a proposed voice write.
 * @param args - Model args.
 * @param dispatchId - Current Live toolCall batch id (must differ from propose batch).
 */
export async function handleConfirmAction(
  args: ConfirmActionArgs,
  dispatchId: string
): Promise<ConfirmToolResult> {
  const actionId = typeof args.actionId === "string" ? args.actionId.trim() : "";
  if (!actionId) {
    return {
      ok: false,
      tool: "confirm_action",
      instruction: "actionId is required from a prior propose_action result.",
      actionLine: "Confirm failed — missing actionId",
      reason: "Missing actionId",
    };
  }

  const accept = args.accept === false || args.accept === "false" ? false : true;

  const api = await safeFetchJson<ConfirmToolResult>("/api/copilot/voice/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actionId, accept, dispatchId }),
    label: "voice-confirm",
    rejectHttpErrors: false,
  });

  if (isFetchAbort(api)) {
    return {
      ok: false,
      tool: "confirm_action",
      instruction: "Confirm was cancelled.",
      actionLine: "Confirm cancelled",
      reason: "Aborted",
    };
  }

  if (!api.ok) {
    return {
      ok: false,
      tool: "confirm_action",
      instruction: "Could not confirm. Do not claim the change succeeded.",
      actionLine: "Confirm failed — request error",
      reason: `HTTP ${api.status}`,
    };
  }

  return { ...api.data, tool: "confirm_action" };
}
