import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultReleaseLifecycleConfig,
  validateReleaseLifecycleConfig,
} from "@/lib/release-lifecycle-config";
import {
  lifecycleConfigPinKind,
  nextLifecycleConfigVersionNumber,
  parseLifecycleConfigSnapshot,
  resolveLifecycleConfigPin,
} from "@/lib/release-lifecycle-config-version";

describe("lifecycleConfigPinKind", () => {
  it("treats a version id as pinned", () => {
    assert.equal(lifecycleConfigPinKind("ver_123"), "pinned");
  });

  it("treats null/undefined as latest-unpinned (legacy rows)", () => {
    assert.equal(lifecycleConfigPinKind(null), "latest-unpinned");
    assert.equal(lifecycleConfigPinKind(undefined), "latest-unpinned");
  });
});

describe("nextLifecycleConfigVersionNumber", () => {
  it("starts at 1 when no versions exist", () => {
    assert.equal(nextLifecycleConfigVersionNumber(null), 1);
    assert.equal(nextLifecycleConfigVersionNumber(undefined), 1);
    assert.equal(nextLifecycleConfigVersionNumber(0), 1);
  });

  it("increments from the current max", () => {
    assert.equal(nextLifecycleConfigVersionNumber(1), 2);
    assert.equal(nextLifecycleConfigVersionNumber(7), 8);
  });
});

describe("parseLifecycleConfigSnapshot", () => {
  it("round-trips a valid Enterprise Default snapshot", () => {
    const defaults = createDefaultReleaseLifecycleConfig();
    const parsed = parseLifecycleConfigSnapshot(defaults);
    assert.equal(parsed.usedEnterpriseDefaultFallback, false);
    assert.equal(validateReleaseLifecycleConfig(parsed.config), null);
    assert.equal(parsed.config.statuses.length, defaults.statuses.length);
  });

  it("falls back loudly on an invalid snapshot", () => {
    const parsed = parseLifecycleConfigSnapshot({ statuses: [], transitions: [] });
    assert.equal(parsed.usedEnterpriseDefaultFallback, true);
    assert.ok(parsed.fallbackReason);
    assert.equal(validateReleaseLifecycleConfig(parsed.config), null);
  });
});

describe("resolveLifecycleConfigPin", () => {
  const latestConfig = createDefaultReleaseLifecycleConfig();
  const pinnedConfig = {
    ...latestConfig,
    statuses: latestConfig.statuses.map((s) =>
      s.key === "draft" ? { ...s, label: "Pinned Draft" } : s
    ),
  };

  it("returns the pinned snapshot when the release has a version id", () => {
    const resolved = resolveLifecycleConfigPin({
      lifecycleConfigVersionId: "v1",
      pinned: { versionId: "v1", version: 1, config: pinnedConfig },
      latest: { versionId: "v2", version: 2, config: latestConfig },
    });
    assert.equal(resolved.configPin, "pinned");
    assert.equal(resolved.versionId, "v1");
    assert.equal(resolved.version, 1);
    assert.equal(
      resolved.config.statuses.find((s) => s.key === "draft")?.label,
      "Pinned Draft"
    );
  });

  it("follows latest when unpinned (mid-flight gap for legacy rows)", () => {
    const resolved = resolveLifecycleConfigPin({
      lifecycleConfigVersionId: null,
      pinned: null,
      latest: { versionId: "v2", version: 2, config: latestConfig },
    });
    assert.equal(resolved.configPin, "latest-unpinned");
    assert.equal(resolved.versionId, "v2");
    assert.equal(resolved.config, latestConfig);
  });

  it("falls back to latest-unpinned when the pin row is missing", () => {
    const resolved = resolveLifecycleConfigPin({
      lifecycleConfigVersionId: "missing",
      pinned: null,
      latest: { versionId: "v2", version: 2, config: latestConfig },
    });
    assert.equal(resolved.configPin, "latest-unpinned");
    assert.equal(resolved.versionId, "v2");
  });
});
