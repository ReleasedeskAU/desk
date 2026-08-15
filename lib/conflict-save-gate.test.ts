import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  conflictChoiceHoldBody,
  shouldHoldWriteForConflictChoice,
} from "@/lib/conflict-save-gate";

const ROOT = join(__dirname, "..");

describe("shouldHoldWriteForConflictChoice", () => {
  it("does not hold the happy path — no findings, no extra step", () => {
    assert.equal(shouldHoldWriteForConflictChoice([], false), false);
    assert.equal(shouldHoldWriteForConflictChoice([], true), false);
  });

  it("holds a conflicting write until Option B", () => {
    assert.equal(shouldHoldWriteForConflictChoice([{ typeKey: "freeze_period" }], false), true);
  });

  it("does not hold after the user chose Raise for RM review", () => {
    assert.equal(shouldHoldWriteForConflictChoice([{ typeKey: "freeze_period" }], true), false);
  });
});

describe("conflictChoiceHoldBody", () => {
  it("says nothing was saved yet", () => {
    const body = conflictChoiceHoldBody([{ summary: "freeze" }]);
    assert.match(body.error, /nothing has been saved yet/i);
    assert.equal(body.requiresConfirmation, true);
    assert.equal(body.pendingConflicts.length, 1);
  });
});

describe("validate-before-commit wiring", () => {
  it("POST /api/releases collects proposed conflicts before createReleaseRow", () => {
    const src = readFileSync(join(ROOT, "app/api/releases/route.ts"), "utf8");
    const collect = src.indexOf("await collectProposedDateConflicts(");
    const create = src.indexOf("await createReleaseRow(");
    assert.ok(collect >= 0 && create >= 0 && collect < create);
    assert.match(src, /shouldHoldWriteForConflictChoice/);
    assert.match(src, /status: 409/);
  });

  it("PATCH /api/releases/[id] collects proposed conflicts before prisma.release.update", () => {
    const src = readFileSync(join(ROOT, "app/api/releases/[id]/route.ts"), "utf8");
    const collect = src.indexOf("await collectProposedDateConflicts(");
    const update = src.indexOf("await prisma.release.update(");
    assert.ok(collect >= 0 && update >= 0 && collect < update);
    assert.match(src, /shouldHoldWriteForConflictChoice/);
    assert.match(src, /status: 409/);
  });

  it("PUT /api/bookings still checks overlap before createEnvBookingRow", () => {
    const src = readFileSync(join(ROOT, "app/api/bookings/route.ts"), "utf8");
    const check = src.indexOf("await checkEnvironmentBookingConflicts(");
    const create = src.indexOf("await createEnvBookingRow(");
    assert.ok(check >= 0 && create >= 0 && check < create);
    assert.match(src, /notifyConflictsRaisedForRm/);
  });
});
