import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCronScope } from "@/lib/lifecycle-automations/scope-policy";

describe("resolveCronScope", () => {
  it("uses owner when clerkUserId is present", () => {
    assert.deepEqual(resolveCronScope("user_abc"), {
      scopeSource: "owner",
      clerkUserId: "user_abc",
    });
  });

  it("uses one fallback path for missing owner and missing bridge", () => {
    assert.deepEqual(resolveCronScope(null), {
      scopeSource: "fallback_default",
      clerkUserId: null,
    });
    assert.deepEqual(resolveCronScope(undefined), {
      scopeSource: "fallback_default",
      clerkUserId: null,
    });
    assert.deepEqual(resolveCronScope("   "), {
      scopeSource: "fallback_default",
      clerkUserId: null,
    });
  });
});
