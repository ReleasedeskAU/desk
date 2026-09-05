import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASK_SEP5_FIXTURE,
  DEFAULT_RESOLVED_STATUSES,
  isOverdue,
  isResolvedStatus,
  openStatusValues,
  sharedAssignees,
  sumOpenCount,
  tiedLeaders,
  unassignedKeys,
} from "./ask-semantics";

describe("open / unresolved rule", () => {
  it("treats only published Done as resolved and sums every other stored status", () => {
    const groups = [
      { value: "To Do", count: 100 },
      { value: "In Progress", count: 12 },
      { value: "In Review", count: 6 },
      { value: "Final Review", count: 11 },
      { value: "Done", count: 12 },
      { value: "Blocked", count: 3 },
    ];
    assert.deepEqual(DEFAULT_RESOLVED_STATUSES, ["Done"]);
    assert.equal(isResolvedStatus("Done"), true);
    assert.equal(isResolvedStatus("To Do"), false);
    assert.equal(isResolvedStatus("Blocked"), false);
    assert.deepEqual(openStatusValues(groups.map((row) => row.value)), [
      "To Do",
      "In Progress",
      "In Review",
      "Final Review",
      "Blocked",
    ]);
    assert.equal(sumOpenCount(groups), 132);
  });

  it("does not use a hardcoded open-status list when a new stored status appears", () => {
    assert.equal(
      sumOpenCount([
        { value: "Parked", count: 4 },
        { value: "Done", count: 1 },
      ]),
      4
    );
  });

  it("records the 5 Sep fixture totals that the rule produced that day", () => {
    assert.equal(ASK_SEP5_FIXTURE.asOf, "2026-09-05");
    assert.equal(ASK_SEP5_FIXTURE.openBugs, 43);
    assert.equal(ASK_SEP5_FIXTURE.mohdUnresolved, 60);
  });
});

describe("overdue rule", () => {
  it("requires a past due date and a non-resolved status", () => {
    const today = "2026-09-05";
    assert.equal(isOverdue({ duedate: "2026-09-04", status: "To Do", today }), true);
    assert.equal(isOverdue({ duedate: "2026-09-04", status: "In Review", today }), true);
    assert.equal(isOverdue({ duedate: "2026-09-04", status: "Done", today }), false);
    assert.equal(isOverdue({ duedate: "2026-09-05", status: "To Do", today }), false);
    assert.equal(isOverdue({ duedate: null, status: "To Do", today }), false);
    assert.equal(isOverdue({ duedate: "not-a-date", status: "To Do", today }), false);
  });

  it("records the 5 Sep fixture overdue keys", () => {
    assert.deepEqual([...ASK_SEP5_FIXTURE.overdueKeys].sort(), [
      "RD-28",
      "RD-30",
      "RD-39",
      "RD-81",
      "RD-82",
      "RD-83",
      "RD-88",
    ]);
  });
});

describe("follow-up groupings A2 / B2", () => {
  it("A2: none of the three highest-priority tickets share an assignee", () => {
    assert.deepEqual(sharedAssignees(ASK_SEP5_FIXTURE.highestPriority), []);
  });

  it("B2: only RD-142 is unassigned — not RD-89", () => {
    assert.deepEqual(unassignedKeys(ASK_SEP5_FIXTURE.highestPriority), ["RD-142"]);
    assert.equal(
      ASK_SEP5_FIXTURE.highestPriority.find((row) => row.key === "RD-89")?.assignee,
      "Jalla"
    );
  });
});

describe("ties", () => {
  it("Q27: states a 3-way tie including unassigned", () => {
    const leaders = tiedLeaders([
      { party: "Release Desk", count: 1 },
      { party: "Jalla", count: 1 },
      { party: "unassigned", count: 1 },
    ]);
    assert.deepEqual(leaders, ["Release Desk", "Jalla", "unassigned"]);
  });
});
