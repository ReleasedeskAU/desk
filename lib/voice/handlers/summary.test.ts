/**
 * get_summary handler — validation + API wiring.
 * Run: npx tsx --test lib/voice/handlers/summary.test.ts
 */
import { describe, it, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleGetSummary } from "./summary";

describe("handleGetSummary", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("rejects missing entityType/entityId", async () => {
    const result = await handleGetSummary({ entityType: "release", entityId: "  " });
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /Missing/i);
  });

  it("rejects unsupported entityType distinctly", async () => {
    const result = await handleGetSummary({ entityType: "spaceship", entityId: "X-1" });
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /Unsupported entityType/i);
    assert.match(result.instruction, /No summary available/i);
  });

  it("maps API not_found to a clear spoken instruction", async () => {
    mock.method(globalThis, "fetch", async () => {
      return new Response(
        JSON.stringify({
          ok: false,
          status: "not_found",
          entityType: "booking",
          entityId: "ENV-9999",
          reason: 'No env booking found for “ENV-9999”',
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    const result = await handleGetSummary({ entityType: "booking", entityId: "ENV-9999" });
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /not found|No env booking found/i);
    assert.match(result.actionLine, /Not found/i);
  });

  it("returns speakable summary on success", async () => {
    mock.method(globalThis, "fetch", async () => {
      return new Response(
        JSON.stringify({
          ok: true,
          status: "found",
          entityType: "blocker",
          entityId: "BLK-0001",
          summary: "Blocker BLK-0001 is Open at High severity on REL-0001.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    const result = await handleGetSummary({ entityType: "blocker", entityId: "BLK-0001" });
    assert.equal(result.ok, true);
    assert.match(result.summary ?? "", /BLK-0001/);
    assert.match(result.instruction, /Speak the summary/i);
  });
});
