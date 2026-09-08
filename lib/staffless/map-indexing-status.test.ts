import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  flattenIndexingStatusPayload,
  mapIndexingStatusToBadge,
  mergeConnectorsWithStatus,
} from "./map-indexing-status";

describe("mapIndexingStatusToBadge", () => {
  it("maps a successful index to CONNECTED", () => {
    const badge = mapIndexingStatusToBadge({ last_finished_status: "success", last_success: "2026-09-01T00:00:00Z" });
    assert.equal(badge.status, "CONNECTED");
    assert.equal(badge.enabled, true);
  });

  it("maps failed and paused states", () => {
    assert.equal(mapIndexingStatusToBadge({ last_finished_status: "failed" }).status, "ERROR");
    assert.equal(mapIndexingStatusToBadge({ cc_pair_status: "PAUSED" }).status, "DISABLED");
  });
});

describe("flattenIndexingStatusPayload", () => {
  it("reads nested indexing_statuses groups", () => {
    const flat = flattenIndexingStatusPayload([
      { source: "jira", indexing_statuses: [{ name: "Jira RD", source: "jira", last_status: "success" }] },
    ]);
    assert.equal(flat.length, 1);
    assert.equal(flat[0].name, "Jira RD");
  });

  it("returns empty for unexpected payloads", () => {
    assert.deepEqual(flattenIndexingStatusPayload({}), []);
    assert.deepEqual(flattenIndexingStatusPayload(null), []);
  });
});

describe("mergeConnectorsWithStatus", () => {
  it("joins snapshots to status by name", () => {
    const rows = mergeConnectorsWithStatus(
      [
        {
          id: 7,
          name: "Jira RD",
          source: "jira",
          connector_specific_config: { jira_base_url: "https://ex.atlassian.net", project_key: "RD" },
          refresh_freq: 900,
        },
      ],
      [{ name: "Jira RD", source: "jira", last_finished_status: "success", last_success: "2026-09-01T00:00:00Z" }]
    );
    assert.equal(rows[0].id, "7");
    assert.equal(rows[0].ccPairId, null);
    assert.equal(rows[0].type, "jira");
    assert.equal(rows[0].status, "CONNECTED");
    assert.equal(rows[0].pollInterval, 15);
    assert.equal((rows[0].config as { projectKey: string }).projectKey, "RD");
  });

  it("maps Teams team names and IMAP host/port/mailboxes back onto wizard config", () => {
    const rows = mergeConnectorsWithStatus(
      [
        {
          id: 8,
          name: "Teams RD",
          source: "teams",
          connector_specific_config: { teams: ["Support", "Engineering"] },
          refresh_freq: 1800,
        },
        {
          id: 9,
          name: "Mail RD",
          source: "imap",
          connector_specific_config: {
            host: "outlook.office365.com",
            port: 993,
            mailboxes: ["INBOX"],
          },
          refresh_freq: 900,
        },
      ],
      [
        { name: "Teams RD", source: "teams", last_finished_status: "success" },
        { name: "Mail RD", source: "imap", last_finished_status: "success" },
      ]
    );
    assert.equal(rows[0].type, "teams");
    assert.equal(rows[0].authType, "api_key");
    assert.equal((rows[0].config as { teamNames: string }).teamNames, "Support, Engineering");
    assert.equal(rows[1].type, "imap");
    assert.equal(rows[1].authType, "basic_token");
    assert.equal(rows[1].baseUrl, "outlook.office365.com");
    assert.equal((rows[1].config as { host: string }).host, "outlook.office365.com");
    assert.equal((rows[1].config as { port: string }).port, "993");
    assert.equal((rows[1].config as { mailboxes: string }).mailboxes, "INBOX");
  });
});
