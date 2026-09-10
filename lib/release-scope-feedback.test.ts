import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  grantsFromScopeWriteBody,
  SCOPE_APPROVE_BY_HELP,
  SCOPE_APPROVE_BY_LABEL,
  SCOPE_APPROVED,
  SCOPE_CHANGE_REQUEST_APPROVED,
  SCOPE_CHANGE_REQUEST_SAVED,
  SCOPE_DRAFT_SAVED,
  SCOPE_EDITOR_ADDED,
  SCOPE_EDITOR_REMOVED,
  SCOPE_SECTION_EDITORS_HELP,
  SCOPE_SECTION_HELP,
} from "./release-scope-feedback";

describe("release-scope-feedback", () => {
  it("keeps the BA success copy", () => {
    assert.equal(SCOPE_DRAFT_SAVED, "Scope draft saved");
    assert.equal(SCOPE_EDITOR_ADDED, "Editor added");
    assert.equal(SCOPE_EDITOR_REMOVED, "Editor removed");
    assert.equal(SCOPE_APPROVED, "Scope approved");
    assert.equal(SCOPE_CHANGE_REQUEST_SAVED, "Change request saved");
    assert.equal(SCOPE_CHANGE_REQUEST_APPROVED, "Change request approved");
  });

  it("keeps the BA labels and i-hover copy", () => {
    assert.equal(SCOPE_APPROVE_BY_LABEL, "Approve by");
    assert.match(SCOPE_APPROVE_BY_HELP, /Not the release end date, and not CAB/);
    assert.match(SCOPE_SECTION_HELP, /change request/);
    assert.match(SCOPE_SECTION_EDITORS_HELP, /They cannot approve/);
  });

  it("reads grants from a successful scope write body", () => {
    const grants = grantsFromScopeWriteBody({
      scope: {
        grants: [
          { id: "g1", granteeUserId: "u1", grantedByUserId: "u2" },
          { id: "skip", granteeUserId: 1 },
        ],
      },
    });
    assert.deepEqual(grants, [{ id: "g1", granteeUserId: "u1", grantedByUserId: "u2" }]);
  });

  it("reads change-request grants when a request id is given", () => {
    const grants = grantsFromScopeWriteBody(
      {
        scope: {
          grants: [{ id: "scope-g", granteeUserId: "u0", grantedByUserId: "u0" }],
          changeRequests: [
            { id: "cr-other", grants: [{ id: "x", granteeUserId: "u9", grantedByUserId: "u9" }] },
            { id: "cr-1", grants: [{ id: "cr-g", granteeUserId: "u3", grantedByUserId: "u4" }] },
          ],
        },
      },
      "cr-1"
    );
    assert.deepEqual(grants, [{ id: "cr-g", granteeUserId: "u3", grantedByUserId: "u4" }]);
  });

  it("returns null when the write body has no grant list", () => {
    assert.equal(grantsFromScopeWriteBody(null), null);
    assert.equal(grantsFromScopeWriteBody({}), null);
    assert.equal(grantsFromScopeWriteBody({ scope: { grants: "nope" } }), null);
    assert.equal(grantsFromScopeWriteBody({ scope: { changeRequests: [] } }, "cr-1"), null);
  });
});
