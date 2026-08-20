/**
 * Blocker / generic entity field-lock catalog and engine.
 * Run: npx tsx --test lib/entity-field-lock-engine.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDefaultBlockerLifecycleConfig } from "./blocker-lifecycle-config";
import { BLOCKER_FIELD_LOCK_CATALOG } from "./blocker-field-lock-catalog";
import { defaultEntityFieldLockRows } from "./entity-field-lock-config-db";
import {
  catalogEntryForEntityBodyKey,
  remapFieldLockRulesToLiveKeys,
} from "./entity-field-lock";
import {
  getEntityFieldLockStateFromRows,
  validateEntityFieldUpdateWithRows,
} from "./entity-field-lock-engine";

describe("blocker field-lock catalog", () => {
  const rows = defaultEntityFieldLockRows("blocker");

  it("locks identity fields in every default status including Reopened", () => {
    for (const key of ["open", "reopened", "closed", "cancelled"]) {
      assert.equal(
        getEntityFieldLockStateFromRows(rows, "blockerCode", key),
        "locked",
        key
      );
      assert.equal(
        getEntityFieldLockStateFromRows(rows, "releaseCode", key),
        "locked",
        key
      );
    }
  });

  it("treats Cancelled like Closed (classification locked)", () => {
    for (const field of ["blockerType", "severity", "assignedTo", "resolutionNotes"]) {
      assert.equal(
        getEntityFieldLockStateFromRows(rows, field, "closed"),
        "locked",
        `${field} closed`
      );
      assert.equal(
        getEntityFieldLockStateFromRows(rows, field, "cancelled"),
        "locked",
        `${field} cancelled`
      );
    }
  });

  it("treats Reopened like Assigned (classification editable)", () => {
    for (const field of ["blockerType", "severity", "assignedTo", "resolutionNotes"]) {
      assert.equal(
        getEntityFieldLockStateFromRows(rows, field, "assigned"),
        "editable",
        `${field} assigned`
      );
      assert.equal(
        getEntityFieldLockStateFromRows(rows, field, "reopened"),
        "editable",
        `${field} reopened`
      );
    }
  });

  it("rejects Severity on Resolved with a plain-English reason", () => {
    const result = validateEntityFieldUpdateWithRows(
      "blocker",
      rows,
      "resolved",
      ["severity"]
    );
    assert.equal(result.allowed, false);
    assert.match(
      result.rejected[0]?.reason ?? "",
      /Severity.+can’t be changed while this blocker is Resolved/
    );
  });

  it("allows Severity while Open", () => {
    const result = validateEntityFieldUpdateWithRows(
      "blocker",
      rows,
      "open",
      ["severity", "blockerDescription"]
    );
    assert.equal(result.allowed, true);
    assert.equal(result.rejected.length, 0);
  });

  it("does not enforce status via field locks (info-only)", () => {
    const result = validateEntityFieldUpdateWithRows("blocker", rows, "closed", [
      "status",
    ]);
    assert.equal(result.allowed, true);
  });

  it("maps notes body key onto the Notes row", () => {
    const entry = catalogEntryForEntityBodyKey(
      BLOCKER_FIELD_LOCK_CATALOG,
      "notes"
    );
    assert.equal(entry?.fieldKey, "resolutionNotes");
  });

  it("marks Blocker ID / Release ID / Created Date as non-configurable", () => {
    for (const key of ["blockerCode", "releaseCode", "createdAt", "status"]) {
      const entry = BLOCKER_FIELD_LOCK_CATALOG.find((e) => e.fieldKey === key);
      assert.ok(entry, key);
      assert.equal(entry!.isConfigurable, false);
    }
  });

  it("remaps default keys onto a renamed live status by label", () => {
    const lifecycle = createDefaultBlockerLifecycleConfig();
    const live = lifecycle.statuses.map((s) =>
      s.key === "open" ? { key: "intake", label: "Open" } : { key: s.key, label: s.label }
    );
    const entry = BLOCKER_FIELD_LOCK_CATALOG.find((e) => e.fieldKey === "severity")!;
    const remapped = remapFieldLockRulesToLiveKeys(
      entry.defaultRules,
      live,
      Object.fromEntries(lifecycle.statuses.map((s) => [s.key, s.label]))
    );
    assert.equal(remapped.intake, "editable");
    assert.equal(remapped.open, undefined);
    assert.equal(remapped.resolved, "locked");
  });

  it("fails closed when the status key is missing from rules", () => {
    assert.equal(
      getEntityFieldLockStateFromRows(rows, "severity", "not_a_status"),
      "locked"
    );
  });
});
