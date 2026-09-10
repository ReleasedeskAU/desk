import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignmentDirectoryOrganizationId,
  listDirectoryUsersForAssignment,
} from "@/lib/release-directory-user";
import { tenantKeyFromSession } from "@/lib/release-scope-files";
import { scopeChangeRequestApproveWhere } from "@/lib/release-scope-service";
import { SCOPE_STATUS_DRAFT } from "@/lib/release-scope-status";
import {
  andReleaseWhereTenantIds,
  assertSameTenantFile,
  releaseRowVisibleToSessionTenant,
  requireTenantOrganizationId,
} from "@/lib/release-scope-tenant";

describe("scope tenant scoping", () => {
  it("rejects empty tenant ids instead of falling back to a default tenant", () => {
    assert.equal(requireTenantOrganizationId(null), null);
    assert.equal(requireTenantOrganizationId(""), null);
    assert.equal(requireTenantOrganizationId("   "), null);
    assert.equal(requireTenantOrganizationId("org_live"), "org_live");

    assert.equal(tenantKeyFromSession(null), null);
    assert.equal(tenantKeyFromSession(""), null);
    assert.equal(tenantKeyFromSession("org_live"), "org_live");
    assert.notEqual(tenantKeyFromSession(null), "default");

    assert.equal(assignmentDirectoryOrganizationId(""), null);
    assert.equal(assignmentDirectoryOrganizationId("org_live"), "org_live");
  });

  it("does not treat a file from another tenant as readable", () => {
    assert.equal(assertSameTenantFile("org_a", "org_a"), true);
    assert.equal(assertSameTenantFile("org_a", "org_b"), false);
    assert.equal(assertSameTenantFile("default", "org_a"), false);
    assert.equal(assertSameTenantFile("", "org_a"), false);
  });

  it("returns no directory users when the organization id is missing", async () => {
    const users = await listDirectoryUsersForAssignment("   ");
    assert.deepEqual(users, []);
  });

  it("loads a list-visible release for the same session tenant", () => {
    const sessionOrg = "org_a";
    const listed = [
      { id: "rel_same", organizationId: "org_a" },
      { id: "rel_other", organizationId: "org_b" },
      { id: "rel_null", organizationId: null },
    ];
    const visibleIds = listed
      .filter((row) => releaseRowVisibleToSessionTenant(row.organizationId, sessionOrg))
      .map((row) => row.id);

    assert.deepEqual(visibleIds, ["rel_same"]);
    assert.deepEqual(andReleaseWhereTenantIds({ status: "Planning" }, visibleIds), {
      AND: [{ status: "Planning" }, { id: { in: ["rel_same"] } }],
    });
    assert.equal(releaseRowVisibleToSessionTenant("org_a", "org_a"), true);
  });

  it("does not load another tenant's release or skip the org match", () => {
    assert.equal(releaseRowVisibleToSessionTenant("org_b", "org_a"), false);
    assert.equal(releaseRowVisibleToSessionTenant("org_b", null), false);
    assert.equal(releaseRowVisibleToSessionTenant(null, "org_a"), false);
    assert.equal(releaseRowVisibleToSessionTenant("", "org_a"), false);
    assert.equal(releaseRowVisibleToSessionTenant(null, null), false);
  });

  it("requires both requestId and scopeId on change-request approve", () => {
    const where = scopeChangeRequestApproveWhere({
      requestId: "req_1",
      scopeId: "scope_1",
      lockVersion: 3,
    });
    assert.equal(where.id, "req_1");
    assert.equal(where.scopeId, "scope_1");
    assert.equal(where.lockVersion, 3);
    assert.equal(where.statusKey, SCOPE_STATUS_DRAFT);
    assert.ok(Object.prototype.hasOwnProperty.call(where, "scopeId"));
    assert.ok(Object.prototype.hasOwnProperty.call(where, "id"));
  });
});
