/**
 * Prove patchBookingSchema rejects unknown fields (no mass-assignment).
 */
import assert from "node:assert/strict";
import { patchBookingSchema } from "../lib/validation/booking";

assert.equal(patchBookingSchema.safeParse({ purpose: "Window" }).success, true);
assert.equal(patchBookingSchema.safeParse({ conflictFlag: true }).success, true);
assert.equal(
  patchBookingSchema.safeParse({ purpose: "x", bookingCode: "ENV-9999" }).success,
  false,
  "immutable bookingCode rejected"
);
assert.equal(
  patchBookingSchema.safeParse({ id: "hack", purpose: "x" }).success,
  false,
  "id mass-assignment rejected"
);

console.log("PASS: patchBookingSchema — allowlist only");
