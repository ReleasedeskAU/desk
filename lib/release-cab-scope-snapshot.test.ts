/**
 * Run: npx tsx --test lib/release-cab-scope-snapshot.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCabScopeSnapshot,
  cabScopeChangedSinceSnapshot,
  parseCabScopeSnapshot,
} from "@/lib/release-cab-scope-snapshot";

describe("CAB scope snapshot (Tranche 2)", () => {
  it("passes when current scope matches snapshot", () => {
    const snap = buildCabScopeSnapshot({
      releaseSize: "Large",
      priority: "P1",
      scopeDescription: "Cutover A",
    });
    assert.equal(
      cabScopeChangedSinceSnapshot(snap, {
        releaseSize: "Large",
        priority: "P1",
        scopeDescription: "Cutover A",
      }),
      null
    );
  });

  it("fails when Size/Priority/Scope Description diverge", () => {
    const snap = buildCabScopeSnapshot({
      releaseSize: "Large",
      priority: "P1",
      scopeDescription: "Cutover A",
    });
    const err = cabScopeChangedSinceSnapshot(snap, {
      releaseSize: "Medium",
      priority: "P1",
      scopeDescription: "Cutover A",
    });
    assert.match(err ?? "", /Size/);
  });

  it("fails closed when snapshot is missing", () => {
    assert.match(
      cabScopeChangedSinceSnapshot(null, { releaseSize: "L" }) ?? "",
      /no CAB scope snapshot/i
    );
  });

  it("parses stored JSON snapshots", () => {
    const parsed = parseCabScopeSnapshot({
      releaseSize: "M",
      priority: "P2",
      scopeDescription: null,
    });
    assert.deepEqual(parsed, {
      releaseSize: "M",
      priority: "P2",
      scopeDescription: null,
    });
  });
});
