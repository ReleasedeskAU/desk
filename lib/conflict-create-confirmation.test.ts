/**
 * RD-134: success shows the existing CreatedConfirmation; failure does not.
 * Run: npx tsx --test lib/conflict-create-confirmation.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  CONFLICT_CREATE_FAILED_MESSAGE,
  conflictCreateUiOutcome,
} from "@/lib/conflict-create-confirmation";

const ROOT = join(__dirname, "..");

describe("conflictCreateUiOutcome", () => {
  it("surfaces the confirmation only on a successful save", () => {
    const outcome = conflictCreateUiOutcome({
      ok: true,
      status: 201,
      data: { error: undefined },
    });
    assert.deepEqual(outcome, { showConfirmation: true });
  });

  it("does not surface a confirmation when the request fails", () => {
    const outcome = conflictCreateUiOutcome({
      ok: false,
      status: 500,
    });
    assert.equal(outcome.showConfirmation, false);
    if (outcome.showConfirmation) {
      assert.fail("expected an error outcome");
    }
    assert.equal(outcome.errorMessage, CONFLICT_CREATE_FAILED_MESSAGE);
  });

  it("keeps the client-safe API error and still hides confirmation on HTTP error", () => {
    const outcome = conflictCreateUiOutcome({
      ok: true,
      status: 400,
      data: { error: "Release 2 must differ from Release 1" },
    });
    assert.equal(outcome.showConfirmation, false);
    if (outcome.showConfirmation) {
      assert.fail("expected an error outcome");
    }
    assert.equal(outcome.errorMessage, "Release 2 must differ from Release 1");
  });
});

describe("ConflictFormModal RD-134 wiring", () => {
  it("reuses CreatedConfirmation and does not reset created when emptyForm identity changes", () => {
    const src = readFileSync(join(ROOT, "components/conflicts/ConflictFormModal.tsx"), "utf8");
    assert.match(src, /CreatedConfirmation/);
    assert.match(src, /title="Conflict created"/);
    assert.match(src, /conflictCreateUiOutcome/);
    // Parent refetch after onCreated() rebuilds emptyForm; that must not wipe `created`.
    assert.doesNotMatch(src, /setCreated\(null\);[\s\S]{0,400}\}, \[open, emptyForm\]\)/);
    assert.match(src, /\}, \[open\]\);/);
  });
});
