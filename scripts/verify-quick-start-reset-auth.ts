/**
 * Focused check: /api/quick-start/reset uses requireRole("editor").
 * Verify the rank gate that backs that call — readonly must fail; editor/admin pass.
 */
import assert from "node:assert/strict";
import { hasMinRole } from "../lib/auth/role-rank";
import type { SessionUser } from "../lib/auth/roles";

function user(role: SessionUser["role"]): SessionUser {
  return { id: "u1", email: "t@example.com", name: "T", role };
}

assert.equal(hasMinRole(user("readonly"), "editor"), false, "readonly must NOT pass editor gate");
assert.equal(hasMinRole(user("editor"), "editor"), true, "editor must pass editor gate");
assert.equal(hasMinRole(user("admin"), "editor"), true, "admin must pass editor gate");
assert.equal(hasMinRole(null, "editor"), false, "unauthenticated must fail");

// Mirrors requireRole failure shape used by quick-start/reset
function wouldReturn403(role: SessionUser["role"] | null): boolean {
  return !hasMinRole(role ? user(role) : null, "editor");
}
assert.equal(wouldReturn403("readonly"), true, "quick-start/reset → 403 for readonly");
assert.equal(wouldReturn403("editor"), false, "quick-start/reset → allow editor");
assert.equal(wouldReturn403("admin"), false, "quick-start/reset → allow admin");

console.log("PASS: quick-start/reset editor gate (readonly → 403)");
