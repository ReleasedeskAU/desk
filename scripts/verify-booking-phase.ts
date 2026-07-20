/**
 * Prove booking phase labels + payload mapping.
 * Run: npx tsx scripts/verify-booking-phase.ts
 */
import assert from "node:assert/strict";
import {
  bookingPhaseLabels,
  buildPhaseDatePayload,
  environmentSortRank,
  resolveBookingPhase,
} from "../lib/booking-phase";

assert.equal(resolveBookingPhase("Test", "Test"), "test");
assert.equal(resolveBookingPhase("UAT", "UAT"), "uat");
assert.equal(resolveBookingPhase("Pre-prod", "Pre-prod"), "preprod");
assert.equal(resolveBookingPhase("DR", "DR"), "other");
assert.equal(resolveBookingPhase("FIN-UAT-01"), "uat");

assert.equal(bookingPhaseLabels("UAT").startField, "UAT Start");
assert.equal(bookingPhaseLabels("Pre-prod").endField, "Pre-Prod End");
assert.equal(bookingPhaseLabels("DR").hint?.includes("Disaster Recovery"), true);
assert.equal(bookingPhaseLabels("Test").envField, "Test Env");

const from = new Date("2026-07-10T00:00:00.000Z");
const to = new Date("2026-07-12T00:00:00.000Z");
const uat = buildPhaseDatePayload("UAT", "UAT", from, to, 3);
assert.equal(uat.uatEnvCode, "UAT");
assert.equal(uat.testEnvCode, "UAT");
assert.equal(uat.preProdEnvCode, null);

const pre = buildPhaseDatePayload("Pre-prod", "Pre-prod", from, to, 3);
assert.equal(pre.preProdEnvCode, "Pre-prod");
assert.equal(pre.uatEnvCode, null);

assert.ok(environmentSortRank("Dev") < environmentSortRank("Test"));
assert.ok(environmentSortRank("Test") < environmentSortRank("UAT"));
assert.ok(environmentSortRank("UAT") < environmentSortRank("Pre-prod"));

console.log("PASS: booking phase labels and payload mapping");
