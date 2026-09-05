import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ASK_TEST_MIN_TOKEN_CHARS, authorizeAskTest } from "./ask-test-auth";

const TOKEN = "a".repeat(ASK_TEST_MIN_TOKEN_CHARS);

describe("authorizeAskTest", () => {
  it("returns 404 when the test route is not enabled", () => {
    const prevEnabled = process.env.ASK_TEST_ENABLED;
    const prevToken = process.env.ASK_TEST_TOKEN;
    process.env.ASK_TEST_ENABLED = "false";
    process.env.ASK_TEST_TOKEN = TOKEN;
    try {
      assert.deepEqual(authorizeAskTest(`Bearer ${TOKEN}`), {
        ok: false,
        status: 404,
        error: "Not found",
      });
    } finally {
      restore(prevEnabled, prevToken);
    }
  });

  it("rejects a missing, short, or wrong token without treating empty as valid", () => {
    const prevEnabled = process.env.ASK_TEST_ENABLED;
    const prevToken = process.env.ASK_TEST_TOKEN;
    process.env.ASK_TEST_ENABLED = "true";
    process.env.ASK_TEST_TOKEN = TOKEN;
    try {
      assert.equal(authorizeAskTest(null).status, 401);
      assert.equal(authorizeAskTest("Bearer short").status, 401);
      assert.equal(authorizeAskTest(`Bearer ${"b".repeat(TOKEN.length)}`).status, 401);
      process.env.ASK_TEST_TOKEN = "";
      assert.equal(authorizeAskTest(`Bearer ${TOKEN}`).status, 401);
    } finally {
      restore(prevEnabled, prevToken);
    }
  });

  it("allows a matching bearer token when enabled, including many sequential calls", () => {
    const prevEnabled = process.env.ASK_TEST_ENABLED;
    const prevToken = process.env.ASK_TEST_TOKEN;
    process.env.ASK_TEST_ENABLED = "true";
    process.env.ASK_TEST_TOKEN = TOKEN;
    try {
      for (let i = 0; i < 25; i++) {
        assert.deepEqual(authorizeAskTest(`Bearer ${TOKEN}`), { ok: true });
      }
    } finally {
      restore(prevEnabled, prevToken);
    }
  });
});

function restore(enabled: string | undefined, token: string | undefined): void {
  if (enabled === undefined) delete process.env.ASK_TEST_ENABLED;
  else process.env.ASK_TEST_ENABLED = enabled;
  if (token === undefined) delete process.env.ASK_TEST_TOKEN;
  else process.env.ASK_TEST_TOKEN = token;
}
