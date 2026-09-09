import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = join(__dirname, "..");

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("native scope write-path wiring", () => {
  it("refuses scopeDescription on Release PATCH so VR-21 cannot fire from scope edits", () => {
    const src = readSrc("app/api/releases/[id]/route.ts");
    assert.match(src, /SCOPE_USE_NATIVE_SECTION/);
    assert.match(src, /requireSession/);
    assert.match(src, /assignmentWriteDenial/);
    assert.match(src, /writeAssignmentAudit/);
    assert.match(src, /Edit scope in the Scope section/);
  });

  it("keeps first approve and change-request approve on separate routes", () => {
    const approve = readSrc("app/api/releases/[id]/scope/approve/route.ts");
    const crApprove = readSrc(
      "app/api/releases/[id]/scope/change-requests/[requestId]/approve/route.ts"
    );
    assert.match(approve, /handleApproveScope/);
    assert.match(crApprove, /handleApproveChangeRequest/);
    const service = readSrc("lib/release-scope-service.ts");
    assert.match(service, /SCOPE_CHANGE_WHY_REQUIRED/);
    assert.doesNotMatch(service, /cabScopeSnapshot\s*:/);
    assert.doesNotMatch(service, /applicationIds\s*:/);
  });

  it("grants any same-tenant user as a section editor, not account-role editors only", () => {
    const routes = readSrc("lib/release-scope-routes.ts");
    assert.match(routes, /isAssignableScopeSectionEditor/);
    assert.doesNotMatch(routes, /isExactEditorDirectoryUser/);
  });

  it("scopes release loads, pickers, grants, and downloads to the session tenant", () => {
    const http = readSrc("lib/release-scope-http.ts");
    assert.match(http, /lookupReleaseForSessionTenant/);
    assert.doesNotMatch(http, /tenantKeyFromSession\(null\)/);

    const directory = readSrc("lib/release-directory-user.ts");
    assert.match(directory, /WHERE "organizationId" = \$\{orgId\}/);
    assert.doesNotMatch(directory, /prisma\.user\.findMany/);

    const routes = readSrc("lib/release-scope-routes.ts");
    assert.match(routes, /listDirectoryUsersForAssignment\(ctx\.tenant\.organizationId\)/);
    assert.match(routes, /scopeAttachmentDownloadHeaders/);
    assert.match(routes, /X-Content-Type-Options|scopeAttachmentDownloadHeaders/);

    const releaseRoute = readSrc("app/api/releases/[id]/route.ts");
    assert.match(releaseRoute, /lookupReleaseForSessionTenant/);
    assert.match(releaseRoute, /listDirectoryUsersForAssignment\(looked\.tenant\.organizationId\)/);
    assert.doesNotMatch(releaseRoute, /listDirectoryUsersForAssignment\(\)/);
  });

  it("approves a change request only when requestId and scopeId both match", () => {
    const service = readSrc("lib/release-scope-service.ts");
    assert.match(service, /scopeChangeRequestApproveWhere/);
    assert.match(service, /findFirst\(\s*\{\s*where: \{ id: args\.requestId, scopeId: args\.scopeId \}/);
  });

  it("wires Manager and Owner pickers to tenant-scoped assignmentOptions, not /api/users", () => {
    const modal = readSrc("components/releases/ReleaseFormModal.tsx");
    assert.match(modal, /assignmentOptionsToSelect\(resolvedAssignmentOptions\?\.owners\)/);
    assert.match(modal, /assignmentOptionsToSelect\(resolvedAssignmentOptions\?\.managers\)/);
    assert.match(modal, /\/api\/release-assignment-options/);
    assert.match(modal, /from "@\/lib\/release-assignment-select"/);
    assert.doesNotMatch(modal, /from "@\/lib\/release-assignment-options"/);
    assert.doesNotMatch(modal, /\/api\/users/);

    const detail = readSrc("components/releases/DbReleaseDetail.tsx");
    assert.match(detail, /assignmentOptions=\{release\.assignmentOptions/);

    const route = readSrc("app/api/release-assignment-options/route.ts");
    assert.match(route, /loadSessionAssignmentOptions/);
    assert.match(route, /TENANT_REQUIRED/);
  });
});
