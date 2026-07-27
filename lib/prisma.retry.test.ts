/**
 * Prisma retry classification for Neon pool / wake errors.
 * Run: npx tsx --test lib/prisma.retry.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isRetryableDbError } from "./prisma";

describe("isRetryableDbError", () => {
  it("retries Neon unreachable and pool timeout messages", () => {
    assert.equal(
      isRetryableDbError({
        code: "P1001",
        message: "Can't reach database server at ep-example.neon.tech:5432",
      }),
      true
    );
    assert.equal(
      isRetryableDbError({
        message:
          "Timed out fetching a new connection from the connection pool. (Current connection pool timeout: 30, connection limit: 5)",
      }),
      true
    );
  });

  it("does not retry unrelated client errors", () => {
    assert.equal(
      isRetryableDbError({
        code: "P2002",
        message: "Unique constraint failed",
      }),
      false
    );
    assert.equal(isRetryableDbError(null), false);
  });
});
