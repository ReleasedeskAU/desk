/**
 * Prove Env Booking phase/milestone colors reuse TIMELINE_TONES (not a private saturated palette).
 */
import assert from "node:assert/strict";
import {
  BOOKING_MILESTONE_STYLE,
  BOOKING_PHASE_STYLE,
  BOOKING_PHASE_TONE,
  BOOKING_MILESTONE_TONE,
} from "../lib/booking-calendar";
import { TIMELINE_TONES } from "../lib/release-timeline";

assert.equal(BOOKING_PHASE_TONE.test, "indigo");
assert.equal(BOOKING_PHASE_TONE.uat, "violet");
assert.equal(BOOKING_PHASE_TONE.preProd, "emerald");
assert.equal(BOOKING_MILESTONE_TONE.cab, "amber");
assert.equal(BOOKING_MILESTONE_TONE.prod, "rose");

for (const phase of ["test", "uat", "preProd"] as const) {
  const tone = BOOKING_PHASE_TONE[phase];
  assert.equal(
    BOOKING_PHASE_STYLE[phase].wash,
    TIMELINE_TONES[tone].pill,
    `${phase} wash must be TIMELINE_TONES.${tone}.pill`
  );
  assert.equal(
    BOOKING_PHASE_STYLE[phase].solid,
    TIMELINE_TONES[tone].solid,
    `${phase} solid must be TIMELINE_TONES.${tone}.solid`
  );
  // Guard against regression to the old saturated Booking-only hexes
  assert.notEqual(BOOKING_PHASE_STYLE[phase].solid, "#0284c7");
  assert.notEqual(BOOKING_PHASE_STYLE[phase].solid, "#7c3aed");
  assert.notEqual(BOOKING_PHASE_STYLE[phase].solid, "#0f766e");
}

assert.equal(BOOKING_MILESTONE_STYLE.cab.wash, TIMELINE_TONES.amber.pill);
assert.equal(BOOKING_MILESTONE_STYLE.prod.wash, TIMELINE_TONES.rose.pill);
assert.notEqual(BOOKING_MILESTONE_STYLE.cab.solid, "#d97706");
assert.notEqual(BOOKING_MILESTONE_STYLE.prod.solid, "#e11d48");

console.log("PASS: booking colors reuse TIMELINE_TONES washes (no private saturated palette)");
