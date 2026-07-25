/**
 * Dispatch hard-gate: propose+confirm in one toolCall batch cannot execute.
 * Run: npx tsx --test lib/voice/handlers/dispatch.write.test.ts
 */
import { describe, it, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { dispatchVoiceToolCalls } from "./dispatch";

describe("dispatchVoiceToolCalls write gate", () => {
  afterEach(() => mock.restoreAll());

  it("blocks confirm_action when propose_action is in the same batch", async () => {
    mock.method(globalThis, "fetch", async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/copilot/voice/propose")) {
        return new Response(
          JSON.stringify({
            ok: true,
            tool: "propose_action",
            actionId: "va_test123",
            description: "Set approval X to Approved",
            actionLine: "PROPOSE: Set approval X to Approved",
            instruction: "wait",
            transcriptRole: "propose",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/copilot/voice/confirm")) {
        return new Response(
          JSON.stringify({
            ok: true,
            tool: "confirm_action",
            resultSummary: "SHOULD NOT HAPPEN",
            actionLine: "CONFIRMED",
            instruction: "x",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 404 });
    });

    const result = await dispatchVoiceToolCalls(
      [
        {
          id: "1",
          name: "propose_action",
          args: {
            actionType: "set_approval_decision",
            params: { id: "APR-1", decision: "Approved", decisionDate: "2026-07-25" },
          },
        },
        {
          id: "2",
          name: "confirm_action",
          args: { actionId: "va_test123", accept: true },
        },
      ],
      { push: () => {} }
    );

    const confirm = result.functionResponses.find((r) => r.name === "confirm_action");
    assert.ok(confirm);
    assert.equal(confirm!.response.ok, false);
    assert.match(String(confirm!.response.reason), /same turn/i);
  });
});
