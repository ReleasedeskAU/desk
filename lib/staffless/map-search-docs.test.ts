import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapSearchDocToWorkItem, mapSearchDocsToWorkItems } from "./map-search-docs";

describe("mapSearchDocToWorkItem", () => {
  it("maps Jira metadata onto the existing table columns", () => {
    const row = mapSearchDocToWorkItem({
      document_id: "https://example.atlassian.net/browse/RD-12",
      semantic_identifier: "RD-12: Fix login timeout",
      source_type: "jira",
      updated_at: "2026-09-01T10:00:00Z",
      metadata: {
        key: "RD-12",
        issuetype: "Bug",
        status: "In Progress",
        priority: "High",
        assignee: "Ada Lovelace",
        updated: "2026-09-01T12:00:00Z",
        parent: "RD-1",
      },
    });
    assert.equal(row.externalId, "RD-12");
    assert.equal(row.title, "Fix login timeout");
    assert.equal(row.itemType, "Bug");
    assert.equal(row.status, "In Progress");
    assert.equal(row.priority, "High");
    assert.equal(row.assignee, "Ada Lovelace");
    assert.equal(row.releaseCode, null);
    assert.equal(row.source, "Jira");
    assert.equal(row.blockedBy, "RD-1");
    assert.equal(row.updatedAt, "2026-09-01T12:00:00Z");
  });

  it("leaves Release empty and falls back when GitHub has no Jira fields", () => {
    const row = mapSearchDocToWorkItem({
      document_id: "https://github.com/org/repo/issues/9",
      semantic_identifier: "9: Bump timeout",
      source_type: "github",
      metadata: { object_type: "PullRequest", state: "open", id: 9, user: "octo" },
    });
    assert.equal(row.externalId, "9");
    assert.equal(row.itemType, "PullRequest");
    assert.equal(row.status, "open");
    assert.equal(row.releaseCode, null);
    assert.equal(row.priority, null);
    assert.equal(row.source, "GitHub");
    assert.equal(row.assignee, "octo");
  });

  it("labels Teams and IMAP sources honestly", () => {
    const teams = mapSearchDocToWorkItem({
      document_id: "teams-1",
      semantic_identifier: "Standup notes",
      source_type: "teams",
    });
    const mail = mapSearchDocToWorkItem({
      document_id: "imap-1",
      semantic_identifier: "Release freeze",
      source_type: "imap",
    });
    assert.equal(teams.source, "Microsoft Teams");
    assert.equal(mail.source, "Email (IMAP)");
  });

  it("deduplicates the same document_id", () => {
    const rows = mapSearchDocsToWorkItems([
      { document_id: "doc-1", semantic_identifier: "A: one", source_type: "jira", metadata: { key: "A" } },
      { document_id: "doc-1", semantic_identifier: "A: one again", source_type: "jira", metadata: { key: "A" } },
    ]);
    assert.equal(rows.length, 1);
  });
});
