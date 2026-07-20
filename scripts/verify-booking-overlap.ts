/**
 * Prove booking date-overlap + env alias matching (env conflict core).
 * Run: npx tsx scripts/verify-booking-overlap.ts
 */
import assert from "node:assert/strict";
import { datesOverlap, sameEnvironmentAlias } from "../lib/booking";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Main path: overlapping windows on the same environment must collide.
assert.equal(datesOverlap(d("2026-07-20"), d("2026-07-22"), d("2026-07-21"), d("2026-07-23")), true);
assert.equal(datesOverlap(d("2026-07-20"), d("2026-07-22"), d("2026-07-22"), d("2026-07-22")), true);

// Edge: adjacent but non-overlapping days are allowed.
assert.equal(datesOverlap(d("2026-07-20"), d("2026-07-21"), d("2026-07-22"), d("2026-07-23")), false);

// Edge: identical single-day windows conflict.
assert.equal(datesOverlap(d("2026-07-20"), d("2026-07-20"), d("2026-07-20"), d("2026-07-20")), true);

// Seed code ↔ catalog name (the ENV-0001 failure mode).
assert.equal(sameEnvironmentAlias("FIN-TEST-01", { name: "Test", type: "Test" }), true);
assert.equal(sameEnvironmentAlias("FIN-UAT-01", { name: "UAT", type: "UAT" }), true);
assert.equal(sameEnvironmentAlias("FIN-PREPROD-01", { name: "Pre-prod", type: "Pre-prod" }), true);
assert.equal(sameEnvironmentAlias("FIN-PROD-01", { name: "Prod", type: "Prod" }), true);

// Must not confuse Prod with Pre-prod.
assert.equal(sameEnvironmentAlias("FIN-PREPROD-01", { name: "Prod", type: "Prod" }), false);
assert.equal(sameEnvironmentAlias("FIN-PROD-01", { name: "Pre-prod", type: "Pre-prod" }), false);

// Exact / case-insensitive style names.
assert.equal(sameEnvironmentAlias("Test", { name: "Test", type: "Test" }), true);
assert.equal(sameEnvironmentAlias(null, { name: "Test" }), false);

console.log("PASS: booking overlap + env alias matching");
