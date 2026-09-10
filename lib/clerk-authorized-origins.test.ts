import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  clerkAuthorizedOrigins,
  CLERK_KNOWN_PRODUCTION_HOSTS,
  toAbsoluteOrigin,
} from "@/lib/clerk-authorized-origins";

describe("clerk authorized origins", () => {
  it("normalizes hosts and full URLs", () => {
    assert.equal(toAbsoluteOrigin("desk-release-desk1.vercel.app"), "https://desk-release-desk1.vercel.app");
    assert.equal(toAbsoluteOrigin("https://releasedesk.vercel.app/"), "https://releasedesk.vercel.app");
    assert.equal(toAbsoluteOrigin("   "), null);
    assert.equal(toAbsoluteOrigin(null), null);
  });

  it("always includes the Production alias QA opens", () => {
    assert.ok(CLERK_KNOWN_PRODUCTION_HOSTS.includes("desk-release-desk1.vercel.app"));
    const origins = clerkAuthorizedOrigins();
    assert.ok(origins.includes("https://desk-release-desk1.vercel.app"));
    assert.ok(origins.includes("https://releasedesk.vercel.app"));
  });

  it("accepts an extra request origin without inventing http for https extras", () => {
    const origins = clerkAuthorizedOrigins(["https://desk-hw0bjrgga-release-desk1.vercel.app"]);
    assert.ok(origins.includes("https://desk-hw0bjrgga-release-desk1.vercel.app"));
  });

  it("wires proxy and ClerkProvider to the shared origin list", () => {
    const root = join(__dirname, "..");
    const proxy = readFileSync(join(root, "proxy.ts"), "utf8");
    const providers = readFileSync(join(root, "components/providers/RootClientProviders.tsx"), "utf8");
    assert.match(proxy, /clerkAuthorizedOrigins/);
    assert.match(proxy, /req\.nextUrl\.origin/);
    assert.match(providers, /clerkAuthorizedOrigins/);
    assert.match(providers, /signInUrl="\/sign-in"/);
  });
});
