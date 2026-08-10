/**
 * Voice ban + daily minutes access decisions.
 * Run: npx tsx --test lib/voice/policy.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  effectiveDailyMinutes,
  evaluateVoiceAccess,
  VOICE_DEFAULT_DAILY_MINUTES,
} from "./policy";

describe("effectiveDailyMinutes", () => {
  it("defaults to 10 when no policy", () => {
    assert.equal(effectiveDailyMinutes(null), VOICE_DEFAULT_DAILY_MINUTES);
  });

  it("returns null when unlimited", () => {
    assert.equal(
      effectiveDailyMinutes({ unlimitedUsage: true, dailyMinutesLimit: 10 }),
      null
    );
  });

  it("uses a custom limit when set", () => {
    assert.equal(
      effectiveDailyMinutes({ unlimitedUsage: false, dailyMinutesLimit: 45 }),
      45
    );
  });
});

describe("evaluateVoiceAccess", () => {
  it("allows under the default 10-minute cap with no policy", () => {
    const r = evaluateVoiceAccess(null, 9.5);
    assert.equal(r.allowed, true);
    assert.equal(r.effectiveDailyMinutes, VOICE_DEFAULT_DAILY_MINUTES);
  });

  it("blocks at the default 10-minute cap with no policy", () => {
    const r = evaluateVoiceAccess(null, 10);
    assert.equal(r.allowed, false);
    assert.equal(r.code, "daily_minutes_ceiling");
    assert.match(r.reason ?? "", /Ask your admin/i);
  });

  it("blocks banned users even under the minutes limit", () => {
    const r = evaluateVoiceAccess(
      { banned: true, dailyMinutesLimit: 60 },
      5
    );
    assert.equal(r.allowed, false);
    assert.equal(r.code, "voice_banned");
  });

  it("blocks when daily minutes are exhausted", () => {
    const r = evaluateVoiceAccess(
      { banned: false, dailyMinutesLimit: 30 },
      30
    );
    assert.equal(r.allowed, false);
    assert.equal(r.code, "daily_minutes_ceiling");
  });

  it("allows under a personal minutes cap", () => {
    const r = evaluateVoiceAccess(
      { banned: false, dailyMinutesLimit: 30 },
      12.5
    );
    assert.equal(r.allowed, true);
  });

  it("treats null dailyMinutesLimit as default 10, not unlimited", () => {
    const r = evaluateVoiceAccess(
      { banned: false, dailyMinutesLimit: null },
      999
    );
    assert.equal(r.allowed, false);
    assert.equal(r.effectiveDailyMinutes, VOICE_DEFAULT_DAILY_MINUTES);
  });

  it("allows unlimited when admin grants unlimitedUsage", () => {
    const r = evaluateVoiceAccess(
      { banned: false, unlimitedUsage: true, dailyMinutesLimit: null },
      999
    );
    assert.equal(r.allowed, true);
    assert.equal(r.unlimitedUsage, true);
    assert.equal(r.effectiveDailyMinutes, null);
  });

  it("notes when a minutes approval is already pending", () => {
    const r = evaluateVoiceAccess(
      {
        banned: false,
        dailyMinutesLimit: 10,
        minutesApprovalRequestedAt: new Date("2026-08-10T00:00:00Z"),
      },
      10
    );
    assert.equal(r.allowed, false);
    assert.equal(r.approvalRequested, true);
    assert.match(r.reason ?? "", /waiting on admin approval/i);
  });
});
