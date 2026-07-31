/**
 * Dispatch Gemini Live toolCalls to voice handlers and build toolResponse payloads.
 */
import { handleNavigateTo, type NavigateDeps } from "@/lib/voice/handlers/navigate";
import { handleSearchEntity } from "@/lib/voice/handlers/search";
import { handleGetSummary } from "@/lib/voice/handlers/summary";
import { handleProposeAction } from "@/lib/voice/handlers/propose";
import { handleConfirmAction } from "@/lib/voice/handlers/confirm";
import { handleApplyListFilters } from "@/lib/voice/handlers/filters";
import { handleExplainPage } from "@/lib/voice/handlers/explain-page";
import { handleRunWalkthrough } from "@/lib/voice/handlers/walkthrough";
import { handleConfigureTableView } from "@/lib/voice/handlers/table-view";
import { handleScrollPage } from "@/lib/voice/handlers/scroll";
import { handleGetPageContext } from "@/lib/voice/handlers/page-context";
import {
  handleCompareReleases,
  handleCopyVisibleCodes,
  handleGetAttentionBrief,
  handleGetCalendarWindow,
  handleGetReleaseBundle,
  handleOpenEntity,
  handleUndoFilters,
} from "@/lib/voice/handlers/manager-tools";

export type VoiceFunctionCall = {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
};

export type DispatchResult = {
  functionResponses: Array<{
    id?: string;
    name: string;
    response: Record<string, unknown>;
  }>;
  actionLines: Array<{ text: string; role: "action" | "propose" | "system" }>;
};

/**
 * Execute voice tool calls from a Live toolCall message.
 * Each invocation gets a unique dispatchId so propose+confirm in the same
 * batch cannot execute a write (hard two-turn gate).
 * @param calls - Function calls from the server toolCall message.
 * @param deps - Navigation deps (router.push).
 */
export async function dispatchVoiceToolCalls(
  calls: VoiceFunctionCall[],
  deps: NavigateDeps
): Promise<DispatchResult> {
  const functionResponses: DispatchResult["functionResponses"] = [];
  const actionLines: DispatchResult["actionLines"] = [];
  // Web Crypto works in browser (Live client) and Node tests.
  const dispatchId = globalThis.crypto.randomUUID();

  // Same-batch hard gate: if propose and confirm both appear, confirm is rejected
  // by action-store (same proposeDispatchId). Also pre-reject confirm when the
  // batch also contains propose_action (clearer error before store lookup).
  const batchHasPropose = calls.some((c) => c.name === "propose_action");
  const batchHasConfirm = calls.some((c) => c.name === "confirm_action");

  for (const call of calls) {
    const name = call.name ?? "";
    const args = call.args ?? {};
    let response: Record<string, unknown>;

    if (name === "navigate_to") {
      const result = await handleNavigateTo(args, deps);
      response = result;
      actionLines.push({ text: result.actionLine, role: "action" });
    } else if (name === "apply_list_filters") {
      const result = await handleApplyListFilters(args, deps);
      response = result;
      actionLines.push({ text: result.actionLine, role: "action" });
    } else if (name === "search_entity") {
      const result = await handleSearchEntity(args);
      response = result;
      actionLines.push({ text: result.actionLine, role: "action" });
    } else if (name === "get_summary") {
      const result = await handleGetSummary(args);
      response = result;
      actionLines.push({ text: result.actionLine, role: "action" });
    } else if (name === "explain_page") {
      const result = await handleExplainPage(args, deps);
      response = result;
      actionLines.push({ text: result.actionLine, role: "action" });
    } else if (name === "run_walkthrough") {
      const result = await handleRunWalkthrough(args, deps);
      response = result;
      actionLines.push({ text: result.actionLine, role: "action" });
    } else if (name === "configure_table_view") {
      const result = await handleConfigureTableView(args, deps);
      response = result;
      actionLines.push({ text: result.actionLine, role: "action" });
    } else if (name === "scroll_page") {
      const result = await handleScrollPage(args);
      response = result;
      actionLines.push({ text: result.actionLine, role: "action" });
    } else if (name === "get_page_context") {
      const result = await handleGetPageContext(args, deps);
      response = result;
      actionLines.push({ text: result.actionLine, role: "action" });
    } else if (name === "get_release_bundle") {
      const result = await handleGetReleaseBundle(args);
      response = result;
      actionLines.push({ text: result.actionLine, role: "action" });
    } else if (name === "get_attention_brief") {
      const result = await handleGetAttentionBrief(args);
      response = result;
      actionLines.push({ text: result.actionLine, role: "action" });
    } else if (name === "get_calendar_window") {
      const result = await handleGetCalendarWindow(args);
      response = result;
      actionLines.push({ text: result.actionLine, role: "action" });
    } else if (name === "compare_releases") {
      const result = await handleCompareReleases(args);
      response = result;
      actionLines.push({ text: result.actionLine, role: "action" });
    } else if (name === "open_entity") {
      const result = await handleOpenEntity(args, deps);
      response = result;
      actionLines.push({ text: result.actionLine, role: "action" });
    } else if (name === "copy_visible_codes") {
      const result = await handleCopyVisibleCodes(args);
      response = result;
      actionLines.push({ text: result.actionLine, role: "action" });
    } else if (name === "undo_filters") {
      const result = await handleUndoFilters(args, deps);
      response = result;
      actionLines.push({ text: result.actionLine, role: "action" });
    } else if (name === "propose_action") {
      const result = await handleProposeAction(args, dispatchId);
      response = result;
      actionLines.push({
        text: result.actionLine,
        role: result.ok ? "propose" : "system",
      });
    } else if (name === "confirm_action") {
      if (batchHasPropose && batchHasConfirm && args.accept !== false) {
        response = {
          ok: false,
          tool: "confirm_action",
          reason:
            "propose_action and confirm_action cannot run in the same turn — wait for an explicit yes in a later turn",
          instruction:
            "Ask the user to confirm with a separate yes/no. Do not execute the write.",
          actionLine: "Confirm blocked — same-turn propose+confirm",
        };
        actionLines.push({ text: String(response.actionLine), role: "system" });
      } else {
        const result = await handleConfirmAction(args, dispatchId);
        response = result;
        actionLines.push({
          text: result.actionLine,
          role: result.discarded ? "action" : result.ok ? "action" : "system",
        });
      }
    } else {
      response = {
        ok: false,
        reason: `Unknown or unsupported tool: ${name || "(missing name)"}`,
        actionLine: `Unsupported tool ${name || "?"}`.trim(),
      };
      actionLines.push({ text: String(response.actionLine), role: "system" });
    }

    functionResponses.push({
      id: call.id,
      name: name || "unknown",
      response,
    });
  }

  return { functionResponses, actionLines };
}
