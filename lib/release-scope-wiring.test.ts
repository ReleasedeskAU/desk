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
});
