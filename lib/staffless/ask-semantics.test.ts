import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyStatusCategory,
  isOpenCategory,
  isResolvedCategory,
  RESOLVED_STATUS_CATEGORY,
} from "../jira-status-category";
import {
  ASK_SEP5_FIXTURE,
  isOverdue,
  openCategoryValues,
  sharedAssignees,
  sumOpenCount,
  sumResolvedCount,
  tiedLeaders,
  unassignedKeys,
} from "./ask-semantics";

describe("open / resolved uses status_category keys, not status names", () => {
  it("treats Closed + status_category=done as resolved", () => {
    assert.equal(isResolvedCategory("done"), true);
    assert.equal(isResolvedCategory("Done"), false);
    assert.equal(isOpenCategory("done"), false);
    assert.equal(RESOLVED_STATUS_CATEGORY, "done");
    assert.equal(classifyStatusCategory("done"), "done");
  });

  it("does not treat status name Done as resolved when the category is missing", () => {
    assert.equal(isResolvedCategory(undefined), false);
    assert.equal(isResolvedCategory(null), false);
    assert.equal(isResolvedCategory(""), false);
    assert.equal(classifyStatusCategory("Closed"), null);
    assert.equal(isOpenCategory("Closed"), false);
    assert.equal(isResolvedCategory("Closed"), false);
    assert.equal(isOpenCategory(undefined), false);
  });

  it("counts open as new + indeterminate only", () => {
    const groups = [
      { value: "new", count: 100 },
      { value: "indeterminate", count: 32 },
      { value: "done", count: 12 },
      { value: "Closed", count: 5 },
    ];
    assert.deepEqual(openCategoryValues(groups.map((row) => row.value)), [
      "new",
      "indeterminate",
    ]);
    assert.equal(sumOpenCount(groups), 132);
    assert.equal(sumResolvedCount(groups), 12);
  });

  it("does not count an untagged or unknown key as open or resolved", () => {
    assert.equal(
      sumOpenCount([
        { value: "Parked", count: 4 },
        { value: "Done", count: 1 },
        { value: "", count: 2 },
      ]),
      0
    );
    assert.equal(
      sumResolvedCount([
        { value: "Done", count: 1 },
        { value: "Closed", count: 3 },
      ]),
      0
    );
  });

  it("records the 5 Sep fixture totals that the old name-list rule produced that day", () => {
    assert.equal(ASK_SEP5_FIXTURE.asOf, "2026-09-05");
    assert.equal(ASK_SEP5_FIXTURE.openBugs, 43);
    assert.equal(ASK_SEP5_FIXTURE.mohdUnresolved, 60);
  });
});

describe("overdue rule", () => {
  it("requires a past due date and an open status_category", () => {
    const today = "2026-09-05";
    assert.equal(
      isOverdue({ duedate: "2026-09-04", statusCategory: "new", today }),
      true
    );
    assert.equal(
      isOverdue({ duedate: "2026-09-04", statusCategory: "indeterminate", today }),
      true
    );
    assert.equal(
      isOverdue({ duedate: "2026-09-04", statusCategory: "done", today }),
      false
    );
    assert.equal(
      isOverdue({ duedate: "2026-09-04", statusCategory: undefined, today }),
      false
    );
    assert.equal(
      isOverdue({ duedate: "2026-09-05", statusCategory: "new", today }),
      false
    );
    assert.equal(isOverdue({ duedate: null, statusCategory: "new", today }), false);
    assert.equal(
      isOverdue({ duedate: "not-a-date", statusCategory: "new", today }),
      false
    );
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
