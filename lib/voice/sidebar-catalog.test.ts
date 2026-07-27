/**
 * Sidebar catalog resolve tests.
 * Run: npx tsx --test lib/voice/sidebar-catalog.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSpokenNavPhrase,
  resolveVoiceNavTarget,
  voiceSidebarCatalogBrief,
} from "./sidebar-catalog";

describe("resolveVoiceNavTarget", () => {
  it("maps calendar tab and calendar page to /calendar", () => {
    assert.equal(resolveVoiceNavTarget("calendar tab")?.path, "/calendar");
    assert.equal(resolveVoiceNavTarget("calendar page")?.path, "/calendar");
    assert.equal(resolveVoiceNavTarget("open the Calendar section")?.path, "/calendar");
  });

  it("maps env booking page and /bookings alias to /booking", () => {
    assert.equal(resolveVoiceNavTarget("env booking page")?.path, "/booking");
    assert.equal(resolveVoiceNavTarget("open environment booking tab")?.path, "/booking");
    assert.equal(resolveVoiceNavTarget("/bookings")?.path, "/booking");
    assert.equal(resolveVoiceNavTarget("/env-booking")?.path, "/booking");
  });

  it("keeps exact known paths", () => {
    assert.equal(resolveVoiceNavTarget("/conflicts")?.path, "/conflicts");
  });

  it("returns null for unknown chatter", () => {
    assert.equal(resolveVoiceNavTarget("make me a sandwich"), null);
  });
});

describe("normalizeSpokenNavPhrase", () => {
  it("strips open/go-to and tab/page filler", () => {
    assert.equal(normalizeSpokenNavPhrase("Go to the Env Booking tab"), "env booking");
  });
});

describe("voiceSidebarCatalogBrief", () => {
  it("includes Env Booking=/booking for the model", () => {
    assert.match(voiceSidebarCatalogBrief(), /Env Booking=\/booking/);
    assert.match(voiceSidebarCatalogBrief(), /Calendar=\/calendar/);
  });
});
