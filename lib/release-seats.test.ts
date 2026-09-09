import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionUser } from "@/lib/auth/roles";
import { createDefaultReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import {
  assignmentPickerOptions,
  assignmentWriteDenial,
  computeReleaseSeats,
  isAssignableScopeSectionEditor,
  isExactEditorDirectoryUser,
  isReleaseSeatWriteLocked,
} from "@/lib/release-seats";
import { scopeSectionCapabilities } from "@/lib/release-scope-permissions";
import {
  DEFAULT_SCOPE_SECTION_CONFIG,
  isScopeApprovalDueOverdue,
  parseScopeSectionConfig,
  SCOPE_STATUS_APPROVED,
  SCOPE_STATUS_DRAFT,
  scopeStatusLabel,
} from "@/lib/release-scope-status";

const config = createDefaultReleaseLifecycleConfig();

const editor: SessionUser = {
  id: "clerk_editor",
  email: "editor@example.com",
  name: "Ed",
  role: "editor",
};
const readonly: SessionUser = {
  id: "clerk_ro",
  email: "ro@example.com",
  name: "Ro",
  role: "readonly",
};
const admin: SessionUser = {
  id: "clerk_admin",
  email: "admin@example.com",
  name: "Ad",
  role: "admin",
};

const ownerRow = {
  id: "user_owner",
  email: "ro@example.com",
  name: "Ro",
  accessLevel: "readonly",
  status: "Active",
};
const editorRow = {
  id: "user_editor",
  email: "editor@example.com",
  name: "Ed",
  accessLevel: "Standard",
  status: "Active",
};
const adminRow = {
  id: "user_admin",
  email: "admin@example.com",
  name: "Ad",
  accessLevel: "Admin",
  status: "Active",
};

describe("release seats", () => {
  it("treats a readonly owner as a seat holder who can edit", () => {
    const decision = computeReleaseSeats({
      session: readonly,
      directoryUser: ownerRow,
      seats: { releaseOwnerId: "user_owner", releaseManagerId: null },
      writeLocked: false,
    });
    assert.equal(decision.holdsSeat, true);
    assert.equal(decision.isCurrentOwner, true);
    assert.equal(assignmentWriteDenial(decision, { releaseOwnerId: "user_editor" }), null);
    assert.equal(assignmentWriteDenial(decision, { releaseManagerId: "user_editor" }), null);
  });

  it("lets an editor who is not the manager only self-assign manager", () => {
    const decision = computeReleaseSeats({
      session: editor,
      directoryUser: editorRow,
      seats: { releaseOwnerId: "user_owner", releaseManagerId: "user_other" },
      writeLocked: false,
    });
    assert.equal(decision.holdsSeat, false);
    assert.equal(assignmentWriteDenial(decision, { releaseManagerId: "user_editor" }), null);
    assert.equal(assignmentWriteDenial(decision, { releaseManagerId: "user_other" })?.code, "MANAGER_ASSIGN_DENIED");
    assert.equal(assignmentWriteDenial(decision, { releaseOwnerId: "user_editor" })?.code, "OWNER_ASSIGN_DENIED");
  });

  it("does not let admin assign manager unless they hold a seat", () => {
    const decision = computeReleaseSeats({
      session: admin,
      directoryUser: adminRow,
      seats: { releaseOwnerId: "user_owner", releaseManagerId: null },
      writeLocked: false,
    });
    assert.equal(decision.isExactEditor, false);
    assert.equal(assignmentWriteDenial(decision, { releaseManagerId: "user_admin" })?.code, "MANAGER_ASSIGN_DENIED");
  });

  it("locks assignment on live and terminal statuses via lifecycle flags", () => {
    assert.equal(isReleaseSeatWriteLocked(config, "Deploying"), true);
    assert.equal(isReleaseSeatWriteLocked(config, "Deployed"), true);
    assert.equal(isReleaseSeatWriteLocked(config, "Closed"), true);
    assert.equal(isReleaseSeatWriteLocked(config, "Cancelled"), true);
    assert.equal(isReleaseSeatWriteLocked(config, "CAB Approved"), false);
    assert.equal(isReleaseSeatWriteLocked(config, "Planning"), false);
    const decision = computeReleaseSeats({
      session: readonly,
      directoryUser: ownerRow,
      seats: { releaseOwnerId: "user_owner", releaseManagerId: null },
      writeLocked: true,
    });
    assert.equal(assignmentWriteDenial(decision, { releaseManagerId: "user_editor" })?.code, "RELEASE_SEAT_WRITES_LOCKED");
  });

  it("builds pickers: managers = exact editors; owners = any existing user", () => {
    const { managers, owners } = assignmentPickerOptions([ownerRow, editorRow, adminRow]);
    assert.deepEqual(managers.map((u) => u.id), ["user_editor"]);
    assert.deepEqual(
      owners.map((u) => u.id).sort(),
      ["user_admin", "user_editor", "user_owner"]
    );
    assert.equal(isExactEditorDirectoryUser(adminRow), false);
    assert.equal(isExactEditorDirectoryUser(ownerRow), false);
  });
});

describe("scope section editors (grants, not account-role editors)", () => {
  it("allows any existing same-tenant user as a section editor, not only account-role editors", () => {
    assert.equal(isAssignableScopeSectionEditor(ownerRow), true);
    assert.equal(isAssignableScopeSectionEditor(adminRow), true);
    assert.equal(isAssignableScopeSectionEditor(editorRow), true);
    assert.equal(isExactEditorDirectoryUser(ownerRow), false);
    assert.equal(isExactEditorDirectoryUser(adminRow), false);
    const { managers } = assignmentPickerOptions([ownerRow, editorRow, adminRow]);
    assert.deepEqual(managers.map((u) => u.id), ["user_editor"]);
  });

  it("does not turn a section editor into a Release Manager or release editor", () => {
    const grantedReadonly = computeReleaseSeats({
      session: readonly,
      directoryUser: ownerRow,
      seats: { releaseOwnerId: "someone_else", releaseManagerId: "user_editor" },
      writeLocked: false,
    });
    assert.equal(grantedReadonly.holdsSeat, false);
    assert.equal(grantedReadonly.isCurrentManager, false);
    assert.equal(
      assignmentWriteDenial(grantedReadonly, { releaseOwnerId: "user_owner" })?.code,
      "OWNER_ASSIGN_DENIED"
    );
    const caps = scopeSectionCapabilities(grantedReadonly, {
      kind: "scope",
      statusKey: SCOPE_STATUS_DRAFT,
      granteeUserIds: ["user_owner"],
    });
    assert.equal(caps.canEditDescription, true);
    assert.equal(caps.canAddAttachments, true);
    assert.equal(caps.canApprove, false);
    assert.equal(caps.canAddGrant, false);
  });

  it("does not carry a scope grant onto a change-request section", () => {
    const decision = computeReleaseSeats({
      session: readonly,
      directoryUser: ownerRow,
      seats: { releaseOwnerId: "someone_else", releaseManagerId: "user_editor" },
      writeLocked: false,
    });
    const onScope = scopeSectionCapabilities(decision, {
      kind: "scope",
      statusKey: SCOPE_STATUS_DRAFT,
      granteeUserIds: ["user_owner"],
    });
    const onRequest = scopeSectionCapabilities(decision, {
      kind: "change_request",
      statusKey: SCOPE_STATUS_DRAFT,
      granteeUserIds: [],
    });
    assert.equal(onScope.canEditDescription, true);
    assert.equal(onRequest.canEditDescription, false);
    assert.equal(onRequest.canAddAttachments, false);
  });
});

describe("scope section permissions", () => {
  it("lets a grant holder edit a draft section but not approve or add people", () => {
    const decision = computeReleaseSeats({
      session: editor,
      directoryUser: editorRow,
      seats: { releaseOwnerId: "user_owner", releaseManagerId: null },
      writeLocked: false,
    });
    const caps = scopeSectionCapabilities(decision, {
      kind: "scope",
      statusKey: SCOPE_STATUS_DRAFT,
      granteeUserIds: ["user_editor"],
    });
    assert.equal(caps.canEditDescription, true);
    assert.equal(caps.canAddAttachments, true);
    assert.equal(caps.canApprove, false);
    assert.equal(caps.canAddGrant, false);
    assert.equal(caps.grantHint, "You can edit this section");
  });

  it("does not keep a leftover grant writable after approval", () => {
    const decision = computeReleaseSeats({
      session: editor,
      directoryUser: editorRow,
      seats: { releaseOwnerId: "user_owner", releaseManagerId: null },
      writeLocked: false,
    });
    const caps = scopeSectionCapabilities(decision, {
      kind: "scope",
      statusKey: SCOPE_STATUS_APPROVED,
      granteeUserIds: ["user_editor"],
    });
    assert.equal(caps.canEditDescription, false);
    assert.equal(caps.canAddAttachments, false);
    assert.equal(caps.canAddGrant, false);
  });

  it("lets the current manager start a change request only after scope is approved", () => {
    const decision = computeReleaseSeats({
      session: editor,
      directoryUser: editorRow,
      seats: { releaseOwnerId: "user_owner", releaseManagerId: "user_editor" },
      writeLocked: false,
    });
    const draft = scopeSectionCapabilities(decision, {
      kind: "scope",
      statusKey: SCOPE_STATUS_DRAFT,
      granteeUserIds: [],
    });
    const approved = scopeSectionCapabilities(decision, {
      kind: "scope",
      statusKey: SCOPE_STATUS_APPROVED,
      granteeUserIds: [],
    });
    assert.equal(draft.canStartChangeRequest, false);
    assert.equal(draft.canApprove, true);
    assert.equal(approved.canStartChangeRequest, true);
    assert.equal(approved.canEditDescription, false);
  });
});

describe("scope status config", () => {
  it("uses keys for logic and tenant label (or purpose) for display", () => {
    const cfg = parseScopeSectionConfig({
      statuses: [{ key: SCOPE_STATUS_DRAFT, label: "", purpose: "Still open" }],
      approvalDueRequired: true,
    });
    assert.equal(cfg.approvalDueRequired, true);
    assert.equal(scopeStatusLabel(cfg, SCOPE_STATUS_DRAFT), "Still open");
    assert.equal(scopeStatusLabel(DEFAULT_SCOPE_SECTION_CONFIG, SCOPE_STATUS_APPROVED).length > 0, true);
    assert.equal(
      isScopeApprovalDueOverdue({
        dueAt: new Date("2000-01-01"),
        statusKey: SCOPE_STATUS_DRAFT,
        now: new Date("2000-01-02"),
      }),
      true
    );
    assert.equal(
      isScopeApprovalDueOverdue({
        dueAt: new Date("2000-01-01"),
        statusKey: SCOPE_STATUS_APPROVED,
        now: new Date("2000-01-02"),
      }),
      false
    );
  });
});
