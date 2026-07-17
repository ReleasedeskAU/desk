import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRetryableDbError } from "../lib/prisma.ts";

describe("isRetryableDbError", () => {
  it("treats Neon unreachable codes as retryable", () => {
    assert.equal(isRetryableDbError({ code: "P1001", message: "Can't reach database server" }), true);
    assert.equal(isRetryableDbError({ code: "P1002", message: "timeout" }), true);
    assert.equal(isRetryableDbError({ name: "PrismaClientInitializationError", message: "x" }), true);
  });

  it("does not retry unrelated errors", () => {
    assert.equal(isRetryableDbError({ code: "P2002", message: "Unique constraint" }), false);
    assert.equal(isRetryableDbError(null), false);
    assert.equal(isRetryableDbError("boom"), false);
  });
});
