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
  assertSameTenantFile,
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
