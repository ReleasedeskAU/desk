import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

/** Mirrors GET /api/work-items query validation (keep in sync with route). */
const querySchema = z
  .object({
    connectorId: z.string().trim().min(1).max(64).optional(),
    source: z.string().trim().min(1).max(64).optional(),
    q: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    offset: z.coerce.number().int().min(0).max(50_000).optional(),
  })
  .strict();

describe("work-items query schema", () => {
  it("accepts empty and valid filters", () => {
    assert.equal(querySchema.safeParse({}).success, true);
    assert.equal(
      querySchema.safeParse({ connectorId: "abc", limit: "50", q: "RD-1" }).success,
      true
    );
  });

  it("rejects unexpected fields and out-of-range limit", () => {
    assert.equal(querySchema.safeParse({ hack: "x" }).success, false);
    assert.equal(querySchema.safeParse({ limit: "9999" }).success, false);
  });
});
