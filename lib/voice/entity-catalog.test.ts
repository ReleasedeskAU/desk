/**
 * Entity catalog brief + app-context visible ordinals.
 * Run: npx tsx --test lib/voice/entity-catalog.test.ts lib/voice/app-context.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  voiceEntityCatalogBrief,
  voiceEntityCatalogEntries,
  ENTITY_CODE_PREFIX,
} from "./entity-catalog";
import {
  formatVoiceAppContextHint,
  resolveVisibleOrdinal,
  setVoiceAppContext,
  getVoiceAppContext,
} from "./app-context";
import { compareBusinessCode } from "./entity-list";

describe("voiceEntityCatalogBrief", () => {
  it("includes major entity kinds and ordinal guidance", () => {
    const brief = voiceEntityCatalogBrief();
    assert.match(brief, /Release/);
    assert.match(brief, /Conflict/);
    assert.match(brief, /REL-/);
    assert.match(brief, /CNF-/);
    assert.match(brief, /APP_CONTEXT/);
    assert.match(brief, /search_entity/);
  });

  it("exposes structured catalog entries", () => {
    const entries = voiceEntityCatalogEntries();
    assert.ok(entries.some((e) => e.entityType === "release"));
    assert.equal(ENTITY_CODE_PREFIX.release, "REL-");
    assert.equal(ENTITY_CODE_PREFIX.conflict, "CNF-");
  });
});

describe("compareBusinessCode", () => {
  it("orders PREFIX-#### numerically", () => {
    assert.ok(compareBusinessCode("CNF-0001", "CNF-0002") < 0);
    assert.ok(compareBusinessCode("REL-0010", "REL-0002") > 0);
    assert.ok(compareBusinessCode("BLK-0001", "CNF-0001") < 0);
  });
});

describe("visible ordinal preference", () => {
  it("resolves first/second from published APP_CONTEXT", () => {
    setVoiceAppContext({
      page: "/releases",
      entityType: "release",
      visible: [
        {
          code: "REL-0003",
          label: "REL-0003 — Filtered first",
          path: "/releases/REL-0003",
        },
        {
          code: "REL-0007",
          label: "REL-0007 — Filtered second",
          path: "/releases/REL-0007",
        },
      ],
      note: "filtered",
    });
    assert.equal(getVoiceAppContext()?.visible[0]?.code, "REL-0003");
    assert.equal(resolveVisibleOrdinal(1, "release")?.code, "REL-0003");
    assert.equal(resolveVisibleOrdinal(2, "release")?.code, "REL-0007");
    assert.equal(resolveVisibleOrdinal(1, "conflict"), null);
    assert.equal(resolveVisibleOrdinal(9, "release"), null);

    const hint = formatVoiceAppContextHint(getVoiceAppContext()!);
    assert.match(hint, /\[APP_CONTEXT\]/);
    assert.match(hint, /1:REL-0003/);
    assert.match(hint, /entityType=release/);

    setVoiceAppContext(null);
    assert.equal(getVoiceAppContext(), null);
  });
});
