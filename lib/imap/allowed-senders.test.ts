import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALLOWED_SENDERS_MAX, parseAllowedSenders } from "./allowed-senders";

describe("parseAllowedSenders", () => {
  it("treats blank input as no sender filter", () => {
    assert.deepEqual(parseAllowedSenders(null), []);
    assert.deepEqual(parseAllowedSenders(""), []);
    assert.deepEqual(parseAllowedSenders(["  "]), []);
  });

  it("parses addresses and domains case-insensitively", () => {
    assert.deepEqual(parseAllowedSenders("Jira@Company.COM\n@alerts.company.com, cab.company.com"), [
      { kind: "address", value: "jira@company.com" },
      { kind: "domain", value: "alerts.company.com" },
      { kind: "domain", value: "cab.company.com" },
    ]);
  });

  it("rejects IMAP-breaking characters and oversized lists", () => {
    assert.throws(() => parseAllowedSenders('evil"from'), /quotes/);
    assert.throws(() => parseAllowedSenders("café@company.com"), /ASCII/);
    assert.throws(
      () => parseAllowedSenders(Array.from({ length: ALLOWED_SENDERS_MAX + 1 }, (_, i) => `u${i}@x.com`)),
      /At most/
    );
  });
});
