/**
 * Voice super-admin email gate.
 * Run: npx tsx --test lib/voice/admin-gate.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isVoiceSuperAdminEmail,
  VOICE_SUPER_ADMIN_EMAIL,
} from "./admin-gate";

describe("isVoiceSuperAdminEmail", () => {
  it("allows only the configured mailbox (case-insensitive)", () => {
    assert.equal(isVoiceSuperAdminEmail(VOICE_SUPER_ADMIN_EMAIL), true);
    assert.equal(isVoiceSuperAdminEmail("Admin@Releasedesk.com.au"), true);
    assert.equal(isVoiceSuperAdminEmail(" admin@releasedesk.com.au "), true);
  });

  it("denies other admins and empty emails", () => {
    assert.equal(isVoiceSuperAdminEmail("admin@releasedesk.com"), false);
    assert.equal(isVoiceSuperAdminEmail("user@company.com"), false);
    assert.equal(isVoiceSuperAdminEmail(""), false);
    assert.equal(isVoiceSuperAdminEmail(null), false);
  });
});
