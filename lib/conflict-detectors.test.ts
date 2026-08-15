import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHANGE_FREEZE_EVENT_TYPE,
  dateFallsInFreezeWindow,
  pairChangeFreezeWindows,
} from "@/lib/conflict-detectors";

describe("pairChangeFreezeWindows", () => {
  it("pairs START/END titles into an inclusive window", () => {
    const windows = pairChangeFreezeWindows([
      {
        date: new Date("2026-12-13T00:00:00.000Z"),
        title: "Year-End Change Freeze START",
        eventType: CHANGE_FREEZE_EVENT_TYPE,
      },
      {
        date: new Date("2026-12-31T00:00:00.000Z"),
        title: "Year-End Change Freeze END",
        eventType: CHANGE_FREEZE_EVENT_TYPE,
      },
    ]);
    assert.equal(windows.length, 1);
    assert.equal(windows[0]?.name, "Year-End Change Freeze");
    assert.equal(
      dateFallsInFreezeWindow(new Date("2026-12-20T12:00:00.000Z"), windows[0]!),
      true
    );
    assert.equal(
      dateFallsInFreezeWindow(new Date("2026-11-01T12:00:00.000Z"), windows[0]!),
      false
    );
  });

  it("treats an unpaired START as a single day and ignores other event types", () => {
    const windows = pairChangeFreezeWindows([
      {
        date: new Date("2026-03-31T00:00:00.000Z"),
        title: "Q1 Quarter-End Freeze START",
        eventType: CHANGE_FREEZE_EVENT_TYPE,
      },
      {
        date: new Date("2026-03-15T00:00:00.000Z"),
        title: "CAB meeting",
        eventType: "CAB MEETING",
      },
    ]);
    assert.equal(windows.length, 1);
    assert.equal(
      dateFallsInFreezeWindow(new Date("2026-03-31T08:00:00.000Z"), windows[0]!),
      true
    );
    assert.equal(
      dateFallsInFreezeWindow(new Date("2026-03-30T08:00:00.000Z"), windows[0]!),
      false
    );
  });
});
