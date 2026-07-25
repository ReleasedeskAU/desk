/**
 * Seed catalog coverage — env booking spoken codes.
 * Run: npx tsx --test lib/search-seed-catalog.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSpokenEnvBookingCode,
  searchSeedCatalog,
  seedBookingCodeExists,
} from "./search-seed-catalog";
import { searchAll } from "./search";

describe("searchSeedCatalog / env booking codes", () => {
  it("normalizes spoken env 001 → ENV-0001", () => {
    assert.equal(normalizeSpokenEnvBookingCode("env 001"), "ENV-0001");
    assert.equal(normalizeSpokenEnvBookingCode("ENV-1"), "ENV-0001");
    assert.equal(normalizeSpokenEnvBookingCode("billing"), null);
  });

  it("finds ENV-0001 for env 001 and includes navigable href", () => {
    const rows = searchSeedCatalog("env 001");
    assert.ok(rows.some((r) => r.href === "/booking/ENV-0001" && r.type === "booking"));
    assert.ok(seedBookingCodeExists("ENV-0001"));
  });

  it("searchAll merges seed booking for env 001", () => {
    const rows = searchAll("env 001");
    assert.ok(rows.some((r) => r.href === "/booking/ENV-0001"));
  });
});
