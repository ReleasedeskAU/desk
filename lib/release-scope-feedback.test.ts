import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  grantsFromScopeWriteBody,
  SCOPE_DRAFT_SAVED,
  SCOPE_EDITOR_ADDED,
} from "./release-scope-feedback";

describe("release-scope-feedback", () => {
  it("keeps the interim success copy", () => {
    assert.equal(SCOPE_DRAFT_SAVED, "Scope draft saved");
    assert.equal(SCOPE_EDITOR_ADDED, "Editor added");
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

  it("returns null when the write body has no grant list", () => {
    assert.equal(grantsFromScopeWriteBody(null), null);
    assert.equal(grantsFromScopeWriteBody({}), null);
    assert.equal(grantsFromScopeWriteBody({ scope: { grants: "nope" } }), null);
  });
});
