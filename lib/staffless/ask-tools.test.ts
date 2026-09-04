import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALLOWED_COUNT_FIELDS } from "./ask-count";
import {
  ASK_TOOL_BREAKDOWN,
  ASK_TOOL_DISTINCT,
  ASK_TOOL_DOCUMENT_BY_KEY,
  ASK_TOOL_GET_VERIFIED_COUNT,
  ASK_TOOL_LIST_MATCHING,
  ASK_TOOL_SEARCH_INDEX,
  ASK_TOOLS,
  dispatchAskTool,
} from "./ask-tools";
import { ASK_AGENT_SYSTEM } from "./ask-copy";
import { ASK_MAX_TOOL_ROUNDS } from "./ask-agent";
import { ASK_NO_TOOL_HINT, ASK_PUBLIC_UNAVAILABLE, ASK_TOOL_FAILURE_HINT } from "./ask-errors";

const CATALOG_TOOLS = [
  ASK_TOOL_GET_VERIFIED_COUNT,
  ASK_TOOL_BREAKDOWN,
  ASK_TOOL_DISTINCT,
  ASK_TOOL_DOCUMENT_BY_KEY,
  ASK_TOOL_LIST_MATCHING,
  ASK_TOOL_SEARCH_INDEX,
];

describe("Ask catalog tools", () => {
  it("exposes six distinct tools with non-overlapping jobs", () => {
    const names = ASK_TOOLS.map((t) => (t.type === "function" ? t.function.name : "")).sort();
    assert.deepEqual(names, [...CATALOG_TOOLS].sort());
    const byName = Object.fromEntries(
      ASK_TOOLS.filter((t) => t.type === "function").map((t) => [
        t.function.name,
        t.function.description ?? "",
      ])
    );
    assert.match(byName[ASK_TOOL_GET_VERIFIED_COUNT] ?? "", /one known stored filter value/);
    assert.match(byName[ASK_TOOL_BREAKDOWN] ?? "", /grouped by one field/);
    assert.match(byName[ASK_TOOL_DISTINCT] ?? "", /values that actually exist/);
    assert.match(byName[ASK_TOOL_DOCUMENT_BY_KEY] ?? "", /exact lookup/i);
    assert.match(byName[ASK_TOOL_LIST_MATCHING] ?? "", /keys\/IDs/);
    assert.match(byName[ASK_TOOL_SEARCH_INDEX] ?? "", /ranked sample/i);
    assert.match(byName[ASK_TOOL_SEARCH_INDEX] ?? "", /Never use this for how-many/);
  });

  it("rejects unknown tools, extra args, and invalid fields without calling StaffLess", async () => {
    const unknown = await dispatchAskTool("drop_table", {});
    assert.match(unknown.result, /unknown_tool/);
    assert.match(unknown.result, /hint/);
    const extra = await dispatchAskTool(ASK_TOOL_BREAKDOWN, {
      field: "assignee",
      extra: true,
    });
    assert.match(extra.result, /invalid_args/);
    const badField = await dispatchAskTool(ASK_TOOL_DISTINCT, { field: "not_a_field" });
    assert.match(badField.result, /invalid_args/);
    const badKey = await dispatchAskTool(ASK_TOOL_DOCUMENT_BY_KEY, { key: "" });
    assert.match(badKey.result, /invalid_args/);
    const missingValue = await dispatchAskTool(ASK_TOOL_LIST_MATCHING, {
      filter_field: "labels",
    });
    assert.match(missingValue.result, /invalid_args/);
  });

  it("allow-lists metadata fields and describes tool choice rather than phrases", () => {
    assert.ok(ALLOWED_COUNT_FIELDS.includes("assignee"));
    assert.ok(ALLOWED_COUNT_FIELDS.includes("status"));
    assert.equal(ASK_MAX_TOOL_ROUNDS >= 4, true);
    assert.match(ASK_AGENT_SYSTEM, /choose by what the question needs/i);
    assert.match(ASK_AGENT_SYSTEM, /get_breakdown_by_field/);
    assert.match(ASK_AGENT_SYSTEM, /list_distinct_values/);
    assert.match(ASK_AGENT_SYSTEM, /list_documents_matching/);
    assert.match(ASK_AGENT_SYSTEM, /map onto a stored label/);
    assert.match(ASK_AGENT_SYSTEM, /A 0 or empty list from a guessed filter is not proof of absence/);
    assert.match(ASK_AGENT_SYSTEM, /get_document_by_key/);
    assert.equal(/how many Jira tickets are indexed/i.test(ASK_AGENT_SYSTEM), false);
    assert.equal(/onyx/i.test(ASK_AGENT_SYSTEM), false);
  });

  it("returns ticket keys from list_documents_matching instead of a count-only payload", async () => {
    const originalFetch = globalThis.fetch;
    const originalPat = process.env.STAFFLESS_AI_PAT;
    const originalUrl = process.env.STAFFLESS_AI_URL;
    process.env.STAFFLESS_AI_PAT = "test-pat";
    process.env.STAFFLESS_AI_URL = "http://staffless.test";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          count: 4,
          source: "jira",
          filter_field: "labels",
          filter_value: "release123",
          matched_values: ["release123"],
          documents: [
            { key: "RD-10", title: "RD-10: One", link: "https://example.test/RD-10" },
            { key: "RD-11", title: "RD-11: Two", link: "https://example.test/RD-11" },
          ],
          truncated: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as typeof fetch;
    try {
      const result = await dispatchAskTool(ASK_TOOL_LIST_MATCHING, {
        source: "jira",
        filter_field: "labels",
        filter_value: "release123",
      });
      const payload = JSON.parse(result.result) as {
        count: number;
        documents: Array<{ key: string }>;
      };
      assert.equal(payload.count, 4);
      assert.deepEqual(
        payload.documents.map((row) => row.key),
        ["RD-10", "RD-11"]
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalPat === undefined) delete process.env.STAFFLESS_AI_PAT;
      else process.env.STAFFLESS_AI_PAT = originalPat;
      if (originalUrl === undefined) delete process.env.STAFFLESS_AI_URL;
      else process.env.STAFFLESS_AI_URL = originalUrl;
    }
  });
});

describe("Ask graceful failures", () => {
  it("keeps user-facing failures plain and free of internals", () => {
    const blob = `${ASK_PUBLIC_UNAVAILABLE}\n${ASK_TOOL_FAILURE_HINT}\n${ASK_NO_TOOL_HINT}`;
    assert.match(ASK_PUBLIC_UNAVAILABLE, /exact counts and breakdowns/i);
    assert.match(ASK_NO_TOOL_HINT, /say clearly what they asked for/i);
    for (const banned of ["traceback", "exception", "stack", "openai", "onyx", "postgres", "ECONNREFUSED"]) {
      assert.equal(new RegExp(banned, "i").test(blob), false, banned);
    }
  });

  it("turns thrown StaffLess errors into a tool result instead of a raw exception", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED 127.0.0.1:secret");
    }) as typeof fetch;
    try {
      const result = await dispatchAskTool(ASK_TOOL_BREAKDOWN, { field: "assignee", source: "jira" });
      assert.match(result.result, /tool_failed/);
      assert.match(result.result, /hint/);
      assert.equal(result.result.includes("ECONNREFUSED"), false);
      assert.equal(result.result.includes("127.0.0.1"), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
