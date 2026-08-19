/**
 * Wiring verification for Blocker field locks.
 *
 * Confirms every user-facing Blocker write path calls the engine, and that
 * lock denials use FIELD_LOCK_DENIED with a plain-English error (not the code).
 *
 * Run: npm run test:lifecycle
 * (or: npx tsx --test lib/blocker-field-lock-wiring.test.ts)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { defaultEntityFieldLockRows } from "@/lib/entity-field-lock-config-db";
import { validateEntityFieldUpdateWithRows } from "@/lib/entity-field-lock-engine";
import { buildFormSaveAlert } from "@/lib/form-save-alert";

const ROOT = join(__dirname, "..");

/** Read a repo-relative source file for wiring assertions. */
function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/**
 * Assert `needle` appears before `before` in source (first occurrence of each).
 */
function assertAppearsBefore(source: string, needle: string, before: string, label: string) {
  const iNeedle = source.indexOf(needle);
  const iBefore = source.indexOf(before);
  assert.ok(iNeedle >= 0, `${label}: missing ${needle}`);
  assert.ok(iBefore >= 0, `${label}: missing ${before}`);
  assert.ok(
    iNeedle < iBefore,
    `${label}: expected ${needle} before ${before}`
  );
}

describe("blocker field-lock write-path inventory (source wiring)", () => {
  it("POST /api/blockers calls validateBlockerFieldUpdate before prisma.blocker.create", () => {
    const src = readSrc("app/api/blockers/route.ts");
    assertAppearsBefore(
      src,
      "await validateBlockerFieldUpdate(",
      "await prisma.blocker.create(",
      "POST /api/blockers"
    );
    assert.match(src, /FIELD_LOCK_DENIED/);
    assert.match(src, /BLOCKER_CREATE_LOCK_SKIP_KEYS/);
    assert.match(src, /raisedDate/);
    assert.match(src, /releaseCode/);
  });

  it("PATCH /api/blockers/[id] calls validateBlockerFieldUpdate before prisma.blocker.update", () => {
    const src = readSrc("app/api/blockers/[id]/route.ts");
    assertAppearsBefore(
      src,
      "keysWithActualBlockerPatchChanges(",
      "await validateBlockerFieldUpdate(",
      "PATCH /api/blockers/[id] changed-keys"
    );
    assertAppearsBefore(
      src,
      "await validateBlockerFieldUpdate(",
      "await prisma.blocker.update(",
      "PATCH /api/blockers/[id]"
    );
    assert.match(src, /FIELD_LOCK_DENIED/);
  });

  it("voice update_blocker stages a PATCH to /api/blockers/:id (same lock path)", () => {
    const src = readSrc("lib/voice/write-actions.ts");
    assert.match(src, /update_blocker/);
    assert.match(src, /\/api\/blockers\/\$\{id\}/);
  });

  it("documents unwired Blocker mutators (gaps — seed/audit only)", () => {
    const seed = readSrc("prisma/seed.ts");
    assert.match(seed, /prisma\.blocker\.createMany/);
    assert.equal(
      seed.includes("validateBlockerFieldUpdate"),
      false,
      "seed still skips field-lock engine — report only"
    );

    const audit = readSrc("scripts/audit-status-transitions.ts");
    assert.match(audit, /prisma\.blocker\.update/);
    assert.equal(
      audit.includes("validateBlockerFieldUpdate"),
      false,
      "status-transition auditor still skips field-lock engine — report only"
    );
  });
});

describe("blocker field-lock denial copy", () => {
  const rows = defaultEntityFieldLockRows("blocker");

  it("denies Severity on Resolved with a plain-English reason (not the code)", () => {
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
    assert.equal(result.rejected[0]?.reason.includes("FIELD_LOCK_DENIED"), false);
  });

  it("allows Severity while Open", () => {
    const result = validateEntityFieldUpdateWithRows(
      "blocker",
      rows,
      "open",
      ["severity"]
    );
    assert.equal(result.allowed, true);
  });

  it("FormAlertDialog titles FIELD_LOCK_DENIED as This field is locked", () => {
    const engine = validateEntityFieldUpdateWithRows(
      "blocker",
      rows,
      "resolved",
      ["severity"]
    );
    const alert = buildFormSaveAlert(
      {
        error: engine.rejected[0]?.reason,
        code: "FIELD_LOCK_DENIED",
        rejected: engine.rejected,
      },
      "Couldn’t save changes. Try again.",
      { entityLabel: "blocker" }
    );
    assert.equal(alert.title, "This field is locked");
    assert.match(alert.message, /Severity/);
    assert.equal(alert.message.includes("FIELD_LOCK_DENIED"), false);
  });
});

describe("blocker field-lock settings wiring", () => {
  it("GET/PUT /api/entity-field-lock-config routes through load/save and rejects side-effect state", () => {
    const src = readSrc("app/api/entity-field-lock-config/route.ts");
    assert.match(src, /loadEntityFieldLockConfig/);
    assert.match(src, /saveEntityFieldLockConfig/);
    assert.match(src, /isEntityFieldLockType/);
    assert.match(src, /z\.enum\(\["editable", "locked"\]\)/);
    assert.equal(src.includes("editable_with_side_effect"), false);
    assert.match(src, /requireSession/);
  });

  it("Blocker Lifecycle Settings exposes a Field Locks tab using live statuses", () => {
    const src = readSrc("components/settings/BlockerLifecycleSettings.tsx");
    assert.match(src, /\["fieldLocks", "Field Locks"\]/);
    assert.match(src, /entityType=blocker/);
    assert.match(src, /includeSideEffect=\{false\}/);
    assert.match(src, /entityLabel="blocker"/);
    assert.match(src, /FieldLocksPanel/);
  });

  it("FieldLocksPanel hides VR-21 side-effect when includeSideEffect is false", () => {
    const src = readSrc("components/settings/lifecycle/FieldLocksPanel.tsx");
    assert.match(src, /includeSideEffect/);
    assert.match(src, /editable_with_side_effect/);
    assert.match(src, /entityLabel/);
  });
});
