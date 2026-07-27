/**
 * navigate_to handler — success navigates; invalid / nonexistent paths do not.
 * Run: npx tsx --test lib/voice/handlers/navigate.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleNavigateTo } from "./navigate";

describe("handleNavigateTo", () => {
  it("pushes an allowlisted list path and returns ok", async () => {
    const pushed: string[] = [];
    const result = await handleNavigateTo(
      { path: "/risks", label: "Risk register" },
      { push: (href) => pushed.push(href) }
    );
    assert.equal(result.ok, true);
    assert.equal(result.path, "/risks");
    assert.equal(result.displayName, "Risk register");
    assert.deepEqual(pushed, ["/risks"]);
  });

  it("does not navigate on hallucinated path", async () => {
    const pushed: string[] = [];
    const result = await handleNavigateTo(
      { path: "/secret-admin-vault" },
      { push: (href) => pushed.push(href) }
    );
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /allowlist/i);
    assert.deepEqual(pushed, []);
  });

  it("rejects syntactically valid but nonexistent /releases/REL-001 (no silent success)", async () => {
    const pushed: string[] = [];
    let fetchCalled = false;
    const result = await handleNavigateTo(
      { path: "/releases/REL-001" },
      {
        push: (href) => pushed.push(href),
        fetch: async () => {
          fetchCalled = true;
          return new Response(null, { status: 404 });
        },
      }
    );
    assert.equal(result.ok, false);
    assert.deepEqual(pushed, []);
    // Hallucinated REL-NNN is rejected before fetch.
    assert.equal(fetchCalled, false);
    assert.match(result.reason ?? "", /not valid|search_entity/i);
  });

  it("navigates to a real synthetic release href from seed data", async () => {
    const pushed: string[] = [];
    const result = await handleNavigateTo(
      { path: "/releases/rel-v2140", label: "Platform Release" },
      {
        push: (href) => pushed.push(href),
        fetch: async () => {
          throw new Error("should not fetch when local catalog hits");
        },
      }
    );
    assert.equal(result.ok, true);
    assert.deepEqual(pushed, ["/releases/rel-v2140"]);
  });

  it("rejects bare search refId (not a route)", async () => {
    const pushed: string[] = [];
    const result = await handleNavigateTo(
      { path: "rel-rel-v2140" },
      { push: (href) => pushed.push(href) }
    );
    assert.equal(result.ok, false);
    assert.deepEqual(pushed, []);
    assert.match(result.reason ?? "", /path|href|search|sidebar|Bare ids/i);
  });

  it("resolves calendar tab and env booking page via sidebar catalog", async () => {
    const pushed: string[] = [];
    const cal = await handleNavigateTo(
      { path: "calendar tab" },
      { push: (href) => pushed.push(href) }
    );
    assert.equal(cal.ok, true);
    assert.equal(cal.path, "/calendar");

    const booking = await handleNavigateTo(
      { path: "env booking page" },
      { push: (href) => pushed.push(href) }
    );
    assert.equal(booking.ok, true);
    assert.equal(booking.path, "/booking");

    const alias = await handleNavigateTo(
      { path: "/bookings" },
      { push: (href) => pushed.push(href) }
    );
    assert.equal(alias.ok, true);
    assert.equal(alias.path, "/booking");
    assert.deepEqual(pushed, ["/calendar", "/booking", "/booking"]);
  });
});
