/**
 * Voice table-view catalog + configure_table_view / scroll_page handlers.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchTableFieldKey,
  resolveVoiceTableViewPage,
  voiceTableViewBrief,
} from "./table-view-catalog";
import { handleConfigureTableView } from "./handlers/table-view";
import { handleScrollPage } from "./handlers/scroll";
import { CONFLICT_COLUMNS, CONFLICT_FILTER_FIELDS } from "@/lib/table-page-columns";

describe("resolveVoiceTableViewPage", () => {
  it("resolves conflicts from path and sidebar name", () => {
    const byPath = resolveVoiceTableViewPage("/conflicts");
    assert.ok(byPath);
    assert.equal(byPath!.pageKey, "conflicts");
    assert.equal(byPath!.lockedColumnKeys[0], "conflictCode");

    const byName = resolveVoiceTableViewPage("conflicts", "/dashboard");
    assert.ok(byName);
    assert.equal(byName!.path, "/conflicts");
  });

  it("falls back to current href", () => {
    const page = resolveVoiceTableViewPage(undefined, "/conflicts?app=x");
    assert.ok(page);
    assert.equal(page!.pageKey, "conflicts");
  });

  it("returns null for unsupported pages", () => {
    assert.equal(resolveVoiceTableViewPage("/dashboard"), null);
  });
});

describe("matchTableFieldKey", () => {
  it("matches column by label or key", () => {
    assert.equal(matchTableFieldKey(CONFLICT_COLUMNS, "Notes"), "notes");
    assert.equal(matchTableFieldKey(CONFLICT_COLUMNS, "assignedTo"), "assignedTo");
    assert.equal(matchTableFieldKey(CONFLICT_FILTER_FIELDS, "Conflict ID"), "conflictCodeQ");
  });

  it("returns null for unknown fields", () => {
    assert.equal(matchTableFieldKey(CONFLICT_COLUMNS, "banana column"), null);
  });
});

describe("handleConfigureTableView", () => {
  it("lists columns and filters for conflicts", async () => {
    const result = await handleConfigureTableView(
      { action: "list" },
      {
        push: () => {},
        getCurrentHref: () => "/conflicts",
        fetch: (async () =>
          new Response(
            JSON.stringify({
              hiddenColumns: ["notes"],
              hiddenFilters: ["notesQ"],
            }),
            { status: 200 }
          )) as typeof fetch,
      }
    );
    assert.equal(result.ok, true);
    assert.equal(result.pageKey, "conflicts");
    assert.ok(result.availableColumns?.some((c) => c.includes("notes")));
    assert.ok(result.sortPresets?.length);
    assert.match(result.instruction, /sort=/i);
  });

  it("shows a hidden column via PUT", async () => {
    const puts: unknown[] = [];
    const result = await handleConfigureTableView(
      { action: "show_columns", keys: "Notes, Assigned To" },
      {
        push: () => {},
        getCurrentHref: () => "/conflicts",
        fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (init?.method === "PUT") {
            puts.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          }
          if (url.includes("table-preferences")) {
            return new Response(
              JSON.stringify({
                hiddenColumns: ["notes", "assignedTo", "department"],
                hiddenFilters: ["notesQ"],
              }),
              { status: 200 }
            );
          }
          return new Response("{}", { status: 404 });
        }) as typeof fetch,
      }
    );
    assert.equal(result.ok, true);
    assert.deepEqual(puts[0], {
      pageKey: "conflicts",
      hiddenColumns: ["department"],
      hiddenFilters: ["notesQ"],
    });
    assert.ok(result.changed?.some((c) => /showed column notes/i.test(c)));
  });

  it("shows all filter controls", async () => {
    const puts: unknown[] = [];
    const result = await handleConfigureTableView(
      { action: "show_all_filters" },
      {
        push: () => {},
        getCurrentHref: () => "/conflicts",
        fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
          if (init?.method === "PUT") {
            puts.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          }
          return new Response(
            JSON.stringify({
              hiddenColumns: [],
              hiddenFilters: ["notesQ", "conflictCodeQ"],
            }),
            { status: 200 }
          );
        }) as typeof fetch,
      }
    );
    assert.equal(result.ok, true);
    assert.deepEqual((puts[0] as { hiddenFilters: string[] }).hiddenFilters, []);
  });

  it("rejects unknown action", async () => {
    const result = await handleConfigureTableView(
      { action: "explode" },
      { push: () => {}, getCurrentHref: () => "/conflicts" }
    );
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /Unknown action/i);
  });
});

describe("handleScrollPage", () => {
  it("defaults to down and returns instruction", async () => {
    const result = await handleScrollPage({});
    assert.equal(result.ok, true);
    assert.equal(result.direction, "down");
    assert.match(result.instruction, /Scrolled down/i);
  });

  it("accepts top", async () => {
    const result = await handleScrollPage({ direction: "top" });
    assert.equal(result.ok, true);
    assert.equal(result.direction, "top");
  });
});

describe("voiceTableViewBrief", () => {
  it("mentions configure_table_view and scroll_page", () => {
    const brief = voiceTableViewBrief();
    assert.match(brief, /configure_table_view/);
    assert.match(brief, /scroll_page/);
    assert.match(brief, /apply_list_filters/);
  });
});
