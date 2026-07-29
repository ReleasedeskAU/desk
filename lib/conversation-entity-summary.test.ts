/**
 * Conversation entity summary — id normalization + demo release path.
 * Run: npx tsx --test lib/conversation-entity-summary.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSummaryEntityId,
  lookupEntitySpokenSummary,
} from "./conversation-entity-summary";

describe("normalizeSummaryEntityId", () => {
  it("strips search refId prefixes and pads env/release codes", () => {
    assert.equal(normalizeSummaryEntityId("booking", "seed-book-ENV-0001"), "ENV-0001");
    assert.equal(normalizeSummaryEntityId("booking", "env 001"), "ENV-0001");
    assert.equal(normalizeSummaryEntityId("release", "REL-1"), "REL-0001");
    assert.equal(normalizeSummaryEntityId("risk", "seed-risk-RSK-001"), "RSK-001");
  });
});

describe("lookupEntitySpokenSummary", () => {
  it("returns unsupported for unknown entity types", async () => {
    const result = await lookupEntitySpokenSummary("spaceship", "X-1");
    assert.equal(result.status, "unsupported");
  });

  it("summarizes demo release rel-v2140 without inventing empty text", async () => {
    const result = await lookupEntitySpokenSummary("release", "rel-v2140");
    assert.equal(result.status, "found");
    if (result.status === "found") {
      assert.match(result.summary, /v2\.14|Platform|BLOCKED|READY|AT RISK|IN PROGRESS|blocker/i);
      assert.ok(result.summary.length > 40);
    }
  });
});
