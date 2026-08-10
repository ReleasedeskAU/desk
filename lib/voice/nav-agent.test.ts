/**
 * Navigation agent — registry derived from nav-data + lookup tool logic.
 * Run: npx tsx --test lib/voice/nav-agent.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { NAV_DATA_ITEMS } from "@/lib/nav-data";
import {
  listSidebarNavRoutes,
  lookupNavigation,
  normalizeNavPath,
  resetNavAgentDomExtras,
  resolveNavTarget,
  syncSidebarFromDom,
  voiceNavAgentBrief,
} from "./nav-agent";

describe("normalizeNavPath", () => {
  it("collapses double slashes from model invents", () => {
    assert.equal(normalizeNavPath("//settings/lifecycle"), "/settings/lifecycle");
    assert.equal(normalizeNavPath("///lifecycle"), "/lifecycle");
  });
});

describe("resolveNavTarget / lookupNavigation", () => {
  beforeEach(() => {
    resetNavAgentDomExtras();
  });

  it("resolves Lifecycle Settings spoken names to /lifecycle", () => {
    assert.equal(resolveNavTarget("lifecycle settings")?.href, "/lifecycle");
    assert.equal(resolveNavTarget("lifecycle")?.href, "/lifecycle");
    assert.equal(resolveNavTarget("open the Lifecycle Settings tab")?.href, "/lifecycle");
  });

  it("maps invented settings/lifecycle paths to /lifecycle", () => {
    assert.equal(resolveNavTarget("/settings/lifecycle")?.href, "/lifecycle");
    assert.equal(resolveNavTarget("//settings/lifecycle")?.href, "/lifecycle");
    const looked = lookupNavigation("//settings/lifecycle");
    assert.equal(looked.ok, true);
    assert.equal(looked.match?.href, "/lifecycle");
  });

  it("keeps env booking aliases", () => {
    assert.equal(resolveNavTarget("env booking page")?.href, "/booking");
    assert.equal(resolveNavTarget("/bookings")?.href, "/booking");
  });

  it("rejects unknown chatter", () => {
    assert.equal(resolveNavTarget("make me a sandwich"), null);
    assert.equal(lookupNavigation("make me a sandwich").ok, false);
  });
});

describe("registry derives from nav-data", () => {
  it("includes every NAV_DATA_ITEMS href in sidebar routes", () => {
    const hrefs = new Set(listSidebarNavRoutes().map((r) => r.href));
    for (const item of NAV_DATA_ITEMS) {
      assert.ok(hrefs.has(item.href), `missing ${item.href}`);
    }
  });

  it("brief lists Lifecycle Settings=/lifecycle", () => {
    assert.match(voiceNavAgentBrief(), /Lifecycle Settings=\/lifecycle/);
    assert.match(voiceNavAgentBrief(), /lookup_navigation/);
  });
});

describe("syncSidebarFromDom", () => {
  beforeEach(() => {
    resetNavAgentDomExtras();
  });

  it("merges live data-voice-nav anchors into lookup", () => {
    const fakeDoc = {
      querySelectorAll: () => [
        {
          getAttribute: (n: string) => (n === "data-voice-nav" ? "/custom-tab" : null),
          textContent: "Custom Tab",
        },
      ],
    };
    assert.equal(syncSidebarFromDom(fakeDoc), 1);
    assert.equal(resolveNavTarget("custom tab")?.href, "/custom-tab");
    assert.equal(lookupNavigation("Custom Tab").match?.href, "/custom-tab");
  });
});
