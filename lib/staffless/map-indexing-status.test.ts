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
});
