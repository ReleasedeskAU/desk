/**
 * Voice list-filters catalog + apply_list_filters handler.
 * Run: npx tsx --test lib/voice/list-filters-catalog.test.ts lib/voice/handlers/filters.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildVoiceFilterHref,
  findFilterPageForPathname,
  resolveFilterField,
  resolveVoiceFilterPage,
  sanitizeVoiceFilterValue,
  voiceListFiltersBrief,
} from "./list-filters-catalog";
import {
  collectVoiceFilterArgs,
  handleApplyListFilters,
} from "./handlers/filters";
import { clearVoiceFilterLookupCache } from "./filter-lookups";

describe("collectVoiceFilterArgs", () => {
  it("merges nested filters with flattened top-level keys", () => {
    const got = collectVoiceFilterArgs({
      page: "/blockers",
      filters: { status: "Open" },
      severity: "Critical",
      clear: true,
    });
    assert.equal(got.ok, true);
    if (!got.ok) return;
    assert.deepEqual(got.filters, { status: "Open", severity: "Critical" });
  });
});

describe("list-filters-catalog", () => {
  it("resolves list and detail paths to filterable pages", () => {
    assert.equal(findFilterPageForPathname("/blockers")?.path, "/blockers");
    assert.equal(
      findFilterPageForPathname("/blockers/BLK-0001")?.path,
      "/blockers"
    );
    assert.equal(findFilterPageForPathname("/releases")?.path, "/releases");
    assert.equal(findFilterPageForPathname("/calendar")?.path, "/calendar");
    assert.equal(
      findFilterPageForPathname("/admin/reference-data")?.path,
      "/admin/reference-data"
    );
    assert.equal(findFilterPageForPathname("/dashboard"), null);
  });

  it("resolves spoken page names", () => {
    const page = resolveVoiceFilterPage("blockers");
    assert.equal(page?.path, "/blockers");
  });

  it("maps filter aliases to schema fields", () => {
    const page = findFilterPageForPathname("/blockers")!;
    assert.equal(resolveFilterField(page.schema, "severity")?.param, "severity");
    assert.equal(resolveFilterField(page.schema, "type")?.param, "type");
    assert.equal(resolveFilterField(page.schema, "assigned")?.param, "assignedTo");
    assert.equal(resolveFilterField(page.schema, "dept")?.param, "dept");
  });

  it("sanitizes filter values", () => {
    assert.equal(sanitizeVoiceFilterValue(" Critical "), "Critical");
    assert.equal(sanitizeVoiceFilterValue(true), "1");
    assert.equal(sanitizeVoiceFilterValue("a\nb"), null);
    assert.equal(sanitizeVoiceFilterValue("x".repeat(200)), null);
  });

  it("builds merge and clear hrefs", () => {
    const page = findFilterPageForPathname("/blockers")!;
    const merged = buildVoiceFilterHref({
      page,
      currentHref: "/blockers?status=Open",
      filters: { severity: "Critical" },
    });
    assert.equal(merged.ok, true);
    if (!merged.ok) return;
    assert.match(merged.href, /status=Open/);
    assert.match(merged.href, /severity=Critical/);

    const cleared = buildVoiceFilterHref({
      page,
      currentHref: "/blockers?status=Open&severity=Critical",
      clear: true,
    });
    assert.equal(cleared.ok, true);
    if (!cleared.ok) return;
    assert.equal(cleared.href, "/blockers");
  });

  it("rejects unknown keys when nothing else applies", () => {
    const page = findFilterPageForPathname("/blockers")!;
    const bad = buildVoiceFilterHref({
      page,
      filters: { notARealFilter: "x" },
    });
    assert.equal(bad.ok, false);
  });

  it("includes a compact brief", () => {
    const brief = voiceListFiltersBrief();
    assert.match(brief, /apply_list_filters/);
    assert.match(brief, /Blockers/);
  });
});

describe("handleApplyListFilters", () => {
  it("pushes filtered href on blockers", async () => {
    const pushed: string[] = [];
    const result = await handleApplyListFilters(
      { page: "/blockers", filters: { severity: "Critical", status: "Open" } },
      {
        push: (href) => {
          pushed.push(href);
        },
        getCurrentHref: () => "/dashboard",
      }
    );
    assert.equal(result.ok, true);
    assert.equal(pushed.length, 1);
    assert.match(pushed[0]!, /\/blockers\?/);
    assert.match(pushed[0]!, /severity=Critical/);
    assert.match(pushed[0]!, /status=Open/);
    assert.match(result.actionLine, /Filtered Blockers/i);
  });

  it("accepts flattened top-level filter args (Gemini Live habit)", async () => {
    const pushed: string[] = [];
    const result = await handleApplyListFilters(
      { page: "/blockers", severity: "Critical", status: "Open" },
      {
        push: (href) => {
          pushed.push(href);
        },
        getCurrentHref: () => "/blockers",
      }
    );
    assert.equal(result.ok, true);
    assert.match(pushed[0]!, /severity=Critical/);
    assert.match(pushed[0]!, /status=Open/);
  });

  it("clears filters on current page", async () => {
    const pushed: string[] = [];
    const result = await handleApplyListFilters(
      { clear: true },
      {
        push: (href) => {
          pushed.push(href);
        },
        getCurrentHref: () => "/risks?status=Open&band=High",
      }
    );
    assert.equal(result.ok, true);
    assert.deepEqual(pushed, ["/risks"]);
    assert.match(result.actionLine, /Cleared filters/i);
  });

  it("clears filters but preserves sort", async () => {
    const pushed: string[] = [];
    const result = await handleApplyListFilters(
      { clear: true },
      {
        push: (href) => {
          pushed.push(href);
        },
        getCurrentHref: () => "/conflicts?status=Open&sort=conflictCode&dir=asc",
      }
    );
    assert.equal(result.ok, true);
    assert.match(pushed[0]!, /sort=conflictCode/);
    assert.match(pushed[0]!, /dir=asc/);
    assert.doesNotMatch(pushed[0]!, /status=/);
  });

  it("sorts via sort + dir top-level args", async () => {
    const pushed: string[] = [];
    const result = await handleApplyListFilters(
      { sort: "conflictCode", dir: "asc" },
      {
        push: (href) => {
          pushed.push(href);
        },
        getCurrentHref: () => "/conflicts?app=kyriba",
      }
    );
    assert.equal(result.ok, true);
    assert.match(pushed[0]!, /sort=conflictCode/);
    assert.match(pushed[0]!, /dir=asc/);
  });

  it("fails on pages without filters", async () => {
    const result = await handleApplyListFilters(
      { filters: { status: "Open" } },
      {
        push: () => {},
        getCurrentHref: () => "/dashboard",
      }
    );
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /no list filters/i);
  });

  it("resolves spoken department name to id via lookups", async () => {
    clearVoiceFilterLookupCache();
    const pushed: string[] = [];
    const result = await handleApplyListFilters(
      { page: "/releases", dept: "Payments" },
      {
        push: (href) => {
          pushed.push(href);
        },
        getCurrentHref: () => "/releases",
        fetch: (async () =>
          new Response(
            JSON.stringify({
              departments: [{ id: "dept_payments", name: "Payments" }],
              applications: [],
            }),
            { status: 200 }
          )) as typeof fetch,
      }
    );
    assert.equal(result.ok, true);
    assert.match(pushed[0]!, /dept=dept_payments/);
  });
});
