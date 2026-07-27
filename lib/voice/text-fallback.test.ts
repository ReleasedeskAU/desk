/**
 * Text fallback parser + two-turn propose/confirm separation.
 * Run: npx tsx --test lib/voice/text-fallback.test.ts
 */
import { describe, it, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { parseVoiceTextCommand } from "./text-fallback";
import { dispatchVoiceToolCalls } from "./handlers/dispatch";

describe("parseVoiceTextCommand", () => {
  it("maps compressed approve to propose_action only (not confirm)", () => {
    const r = parseVoiceTextCommand("yes approve APR-0001");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0]!.name, "propose_action");
    assert.match(r.note ?? "", /propose only/i);
  });

  it("rejects yes without a pending actionId", () => {
    const r = parseVoiceTextCommand("yes");
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.reason, /no pending proposal/i);
  });

  it("maps yes to confirm_action when pendingActionId is set", () => {
    const r = parseVoiceTextCommand("yes", "va_abc");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.calls[0]!.name, "confirm_action");
    assert.equal(r.calls[0]!.args?.actionId, "va_abc");
    assert.equal(r.calls[0]!.args?.accept, true);
  });
});

describe("text fallback uses same dispatch two-turn gate", () => {
  afterEach(() => mock.restoreAll());

  it("cannot confirm in the same typed turn as propose (same-batch gate)", async () => {
    mock.method(globalThis, "fetch", async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/propose")) {
        return new Response(
          JSON.stringify({
            ok: true,
            actionId: "va_text1",
            actionLine: "PROPOSE: approval",
            instruction: "wait",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/confirm")) {
        return new Response(
          JSON.stringify({ ok: true, actionLine: "SHOULD NOT" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 404 });
    });

    // Simulate a buggy single-message that tried both — dispatch still blocks.
    const result = await dispatchVoiceToolCalls(
      [
        {
          id: "a",
          name: "propose_action",
          args: {
            actionType: "set_approval_decision",
            params: { id: "APR-1", decision: "Approved", decisionDate: "2026-07-22" },
          },
        },
        {
          id: "b",
          name: "confirm_action",
          args: { actionId: "va_text1", accept: true },
        },
      ],
      { push: () => {} }
    );
    const confirm = result.functionResponses.find((r) => r.name === "confirm_action");
    assert.equal(confirm?.response.ok, false);
  });

  it("two distinct text turns: propose then yes → confirm reaches API", async () => {
    const hits: string[] = [];
    mock.method(globalThis, "fetch", async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/propose")) {
        hits.push("propose");
        return new Response(
          JSON.stringify({
            ok: true,
            actionId: "va_text2",
            actionLine: "PROPOSE: Set approval APR-1 to Approved",
            instruction: "Ask yes",
            transcriptRole: "propose",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/confirm")) {
        hits.push("confirm");
        return new Response(
          JSON.stringify({
            ok: true,
            actionLine: "CONFIRMED",
            instruction: "done",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 404 });
    });

    const proposeParsed = parseVoiceTextCommand("approve APR-0001");
    assert.equal(proposeParsed.ok, true);
    if (!proposeParsed.ok) return;
    const turn1 = await dispatchVoiceToolCalls(proposeParsed.calls, { push: () => {} });
    const actionId = String(
      turn1.functionResponses[0]?.response.actionId ?? ""
    );
    assert.equal(actionId, "va_text2");

    const yesParsed = parseVoiceTextCommand("yes", actionId);
    assert.equal(yesParsed.ok, true);
    if (!yesParsed.ok) return;
    const turn2 = await dispatchVoiceToolCalls(yesParsed.calls, { push: () => {} });
    assert.equal(turn2.functionResponses[0]?.response.ok, true);
    assert.deepEqual(hits, ["propose", "confirm"]);
  });
});
