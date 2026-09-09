/**
 * RD-135: Conflict create must not show Cancelled / Closed / Rollback fields.
 *
 * Run: npx tsx --test lib/conflict-create-fields.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  conflictOutcomeFieldKeys,
  isConflictOutcomeFieldLabel,
  parseJsxFieldLabels,
  parseTypeFieldKeys,
  parseZodObjectFieldKeys,
} from "@/lib/conflict-create-fields";

const ROOT = join(__dirname, "..");

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("conflictOutcomeFieldKeys", () => {
  it("matches cancelledAt / closedAt / rollback and ignores create keys", () => {
    assert.deepEqual(
      conflictOutcomeFieldKeys(["cancelledAt", "closedAt", "rollback", "status"]),
      ["cancelledAt", "closedAt", "rollback"]
    );
    assert.deepEqual(conflictOutcomeFieldKeys(["release1Code", "notes"]), []);
    assert.equal(isConflictOutcomeFieldLabel("Cancel"), false);
    assert.equal(isConflictOutcomeFieldLabel("Cancelled"), true);
  });
});

describe("Conflict create field set (RD-135)", () => {
  it("create form FormValues does not include cancelled / closed / rollback", () => {
    const keys = parseTypeFieldKeys(
      readSrc("components/conflicts/ConflictFormModal.tsx"),
      "FormValues"
    );
    assert.deepEqual(conflictOutcomeFieldKeys(keys), []);
    const labels = parseJsxFieldLabels(
      readSrc("components/conflicts/ConflictFormModal.tsx")
    );
    assert.deepEqual(
      labels.filter((label) => isConflictOutcomeFieldLabel(label)),
      []
    );
  });

  it("create schema keeps required create fields and omits outcome keys", () => {
    const keys = parseZodObjectFieldKeys(
      readSrc("lib/validation/conflict.ts"),
      "createConflictSchema"
    );
    assert.ok(keys.includes("release1Code"));
    assert.ok(keys.includes("status"));
    assert.deepEqual(conflictOutcomeFieldKeys(keys), []);
  });
});

describe("Conflict edit field set (RD-135 edge)", () => {
  it("edit draft keeps outcome keys when present, otherwise keeps required create fields", () => {
    const editKeys = parseTypeFieldKeys(
      readSrc("app/(main)/conflicts/[id]/page.tsx"),
      "ConflictDraft"
    );
    const outcomeOnEdit = conflictOutcomeFieldKeys(editKeys);
    const createKeys = parseTypeFieldKeys(
      readSrc("components/conflicts/ConflictFormModal.tsx"),
      "FormValues"
    );
    if (outcomeOnEdit.length > 0) {
      // Edit may keep outcome fields; create must not grow them (create-only ticket).
      assert.deepEqual(conflictOutcomeFieldKeys(createKeys), []);
      return;
    }
    assert.ok(createKeys.includes("release1Code"));
    assert.deepEqual(
      conflictOutcomeFieldKeys(
        parseZodObjectFieldKeys(readSrc("lib/validation/conflict.ts"), "patchConflictSchema")
      ),
      []
    );
  });
});
