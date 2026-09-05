import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPassableForComparison, parseAskNdjson } from "./ndjson";
import { csvEscape } from "./sanitize";

describe("parseAskNdjson", () => {
  it("concatenates text events and captures session, status, grounding, done", () => {
    const body = [
      '{"type":"session","sessionId":"11111111-1111-4111-8111-111111111111"}',
      '{"type":"status","phase":"searching"}',
      '{"type":"status","phase":"answering"}',
      '{"type":"grounding","kind":"verified"}',
      '{"type":"text","text":"RD-3 is "}',
      '{"type":"text","text":"a ticket."}',
      '{"type":"done"}',
      "",
    ].join("\n");
    const parsed = parseAskNdjson(body);
    assert.equal(parsed.text, "RD-3 is a ticket.");
    assert.equal(parsed.session_id, "11111111-1111-4111-8111-111111111111");
    assert.equal(parsed.grounding, "verified");
    assert.deepEqual(parsed.status_events, [{ phase: "searching" }, { phase: "answering" }]);
    assert.equal((parsed.done_event as { type?: string })?.type, "done");
    assert.equal(parsed.malformed_lines, 0);
  });

  it("records malformed lines and error events without throwing", () => {
    const body = ["not-json", '{"type":"error","message":"unavailable"}', "42"].join("\n");
    const parsed = parseAskNdjson(body);
    assert.equal(parsed.text, "");
    assert.equal(parsed.malformed_lines, 2);
    assert.equal((parsed.error_event as { message?: string })?.message, "unavailable");
  });
});

describe("isPassableForComparison", () => {
  it("requires a non-empty Ask answer", () => {
    assert.equal(isPassableForComparison("answer"), true);
    assert.equal(isPassableForComparison("   "), false);
  });
});

describe("csvEscape", () => {
  it("quotes commas and doubled quotes", () => {
    assert.equal(csvEscape("plain"), "plain");
    assert.equal(csvEscape('say "hi", please'), '"say ""hi"", please"');
  });
});
