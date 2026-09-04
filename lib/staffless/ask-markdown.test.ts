import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAskInline, parseAskMarkdown } from "./ask-markdown";

const JIRA_TABLE = `Here are the Jira issues currently in the index:

| Key | Title | Status | Type |
| --- | --- | --- | --- |
| RD-1 | Fix **login** timeout | In Progress | Bug |
| RD-12 | [SSO](https://example.atlassian.net/browse/RD-12) | Open | Story |
`;

describe("parseAskMarkdown tables", () => {
  it("parses a GFM pipe table into headers and rows", () => {
    const blocks = parseAskMarkdown(JIRA_TABLE);
    const table = blocks.find((b) => b.type === "table");
    assert.equal(blocks[0]?.type, "paragraph");
    assert.ok(table && table.type === "table");
    if (table.type !== "table") throw new Error("expected table");
    assert.deepEqual(table.headers, ["Key", "Title", "Status", "Type"]);
    assert.equal(table.rows.length, 2);
    assert.equal(table.rows[0]?.[0], "RD-1");
    assert.equal(table.rows[1]?.[1], "[SSO](https://example.atlassian.net/browse/RD-12)");
  });

  it("parses header rows without outer pipes", () => {
    const blocks = parseAskMarkdown("Key | Title\n--- | ---\nRD-1 | Login\n");
    const table = blocks.find((b) => b.type === "table");
    assert.ok(table && table.type === "table");
    if (table.type !== "table") throw new Error("expected table");
    assert.deepEqual(table.headers, ["Key", "Title"]);
    assert.deepEqual(table.rows[0], ["RD-1", "Login"]);
  });

  it("keeps an incomplete table as a paragraph while streaming", () => {
    const blocks = parseAskMarkdown("| Key | Title |\n| RD-1 | Login |");
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.type, "paragraph");
    assert.match((blocks[0] as { text: string }).text, /\| Key \|/);
  });
});

describe("parseAskMarkdown prose", () => {
  it("parses headings, lists, fences, and bold/code/links", () => {
    const blocks = parseAskMarkdown(
      "### Summary\n\n- first\n- second\n\nUse **bold** and `RD-1` and [doc](https://example.com/x).\n\n```\ncode\n```\n"
    );
    assert.equal(blocks[0]?.type, "heading");
    assert.equal(blocks[1]?.type, "list");
    assert.equal(blocks[2]?.type, "paragraph");
    assert.equal(blocks[3]?.type, "code");
    const inline = parseAskInline("Use **bold** and `RD-1` and [doc](https://example.com/x).");
    assert.deepEqual(
      inline.map((p) => p.type),
      ["text", "bold", "text", "code", "text", "link", "text"]
    );
  });

  it("does not treat javascript: as a link and leaves HTML as text", () => {
    const bad = parseAskInline("[x](javascript:alert(1))");
    assert.equal(bad[0]?.type, "text");
    const html = parseAskMarkdown("<script>alert(1)</script>");
    assert.equal(html[0]?.type, "paragraph");
    if (html[0]?.type !== "paragraph") throw new Error("expected paragraph");
    assert.equal(html[0].text, "<script>alert(1)</script>");
  });
});
