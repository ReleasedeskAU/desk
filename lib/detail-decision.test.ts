/**
 * Decision-first detail layout rules.
 * Run: npx tsx --test lib/detail-decision.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectAttention,
  describeDue,
  dueTone,
  summarizeAttention,
  visibleActions,
  type DetailAttentionCandidate,
} from "./detail-decision";

const NOW = new Date("2026-08-06T12:00:00.000Z");

describe("collectAttention", () => {
  it("keeps firing conditions and sorts criticals ahead of warnings", () => {
    const candidates: DetailAttentionCandidate[] = [
      { id: "freeze", tone: "warning", label: "Change freeze active", when: true },
      { id: "blockers", tone: "critical", label: "2 open blockers", when: true },
      { id: "conflict", tone: "critical", label: "Env conflict", when: true },
    ];

    const items = collectAttention(candidates);

    assert.deepEqual(
      items.map((i) => i.id),
      ["blockers", "conflict", "freeze"]
    );
    assert.equal(items.every((i) => !("when" in i)), true);
  });

  it("drops conditions that are not firing and de-duplicates ids", () => {
    const items = collectAttention([
      { id: "blockers", tone: "critical", label: "First wins", when: true },
      { id: "blockers", tone: "warning", label: "Duplicate", when: true },
      { id: "overdue", tone: "critical", label: "Not firing", when: false },
    ]);

    assert.equal(items.length, 1);
    assert.equal(items[0].label, "First wins");
  });

  it("returns an empty list when nothing is wrong", () => {
    assert.deepEqual(collectAttention([]), []);
    assert.deepEqual(
      collectAttention([{ id: "a", tone: "critical", label: "x", when: false }]),
      []
    );
  });
});

describe("summarizeAttention", () => {
  it("reports the single item verbatim", () => {
    const summary = summarizeAttention([
      { id: "blockers", tone: "critical", label: "2 open blockers" },
    ]);

    assert.equal(summary.tone, "critical");
    assert.equal(summary.criticalCount, 1);
    assert.equal(summary.headline, "2 open blockers");
  });

  it("downgrades tone to warning when no criticals are present", () => {
    const summary = summarizeAttention([
      { id: "freeze", tone: "warning", label: "Change freeze" },
      { id: "readiness", tone: "warning", label: "Readiness 40%" },
    ]);

    assert.equal(summary.tone, "warning");
    assert.equal(summary.criticalCount, 0);
    assert.equal(summary.warningCount, 2);
    assert.equal(summary.headline, "2 items need attention");
  });

  it("falls back to the clear label when nothing is firing", () => {
    const summary = summarizeAttention([], "All clear");

    assert.equal(summary.tone, "clear");
    assert.equal(summary.headline, "All clear");
    assert.equal(summary.criticalCount, 0);
  });
});

describe("describeDue", () => {
  it("flags past dates as overdue with a day count", () => {
    const due = describeDue("2026-08-01T12:00:00.000Z", { now: NOW });

    assert.equal(due.state, "overdue");
    assert.equal(due.label, "Overdue by 5 days");
    assert.equal(due.days, -5);
  });

  it("separates today, imminent, and merely scheduled dates", () => {
    assert.equal(describeDue("2026-08-06T12:00:00.000Z", { now: NOW }).state, "today");
    assert.equal(describeDue("2026-08-08T12:00:00.000Z", { now: NOW }).state, "soon");
    assert.equal(describeDue("2026-09-06T12:00:00.000Z", { now: NOW }).state, "scheduled");
  });

  it("singularizes a one-day horizon", () => {
    assert.equal(describeDue("2026-08-07T12:00:00.000Z", { now: NOW }).label, "In 1 day");
  });

  it("returns unknown for missing or unparseable input", () => {
    for (const value of [null, undefined, "", "not-a-date"]) {
      const due = describeDue(value, { now: NOW });
      assert.equal(due.state, "unknown");
      assert.equal(due.label, "—");
      assert.equal(due.days, null);
    }
  });
});

describe("dueTone", () => {
  it("colours overdue red and imminent amber, everything else neutral", () => {
    assert.equal(dueTone("overdue"), "bad");
    assert.equal(dueTone("today"), "warn");
    assert.equal(dueTone("soon"), "warn");
    assert.equal(dueTone("scheduled"), "neutral");
    assert.equal(dueTone("unknown"), "neutral");
  });
});

describe("visibleActions", () => {
  it("hides write actions from viewers but keeps navigation", () => {
    const actions = [
      { id: "open", label: "View release", href: "/releases/1" },
      { id: "approve", label: "Approve", write: true, onClick: () => {} },
    ];

    assert.deepEqual(
      visibleActions(actions, false).map((a) => a.id),
      ["open"]
    );
    assert.deepEqual(
      visibleActions(actions, true).map((a) => a.id),
      ["open", "approve"]
    );
  });
});
