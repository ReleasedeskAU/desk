import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { indexingStartForRange, jiraProjectInJql, parseGeneratedJiraProjectJql, parseJiraProjectKeys, parseOptionalIndexingStart } from "./project-keys";
import { mapJiraProjectListPayload } from "./projects";
import { parsePublicJiraOrigin } from "./site";

describe("parsePublicJiraOrigin", () => {
  it("accepts an Atlassian cloud HTTPS origin", () => {
    assert.equal(parsePublicJiraOrigin("https://acme.atlassian.net/jira"), "https://acme.atlassian.net");
  });

  it("rejects http, localhost, and IP literals", () => {
    assert.throws(() => parsePublicJiraOrigin("http://acme.atlassian.net"), /https/);
    assert.throws(() => parsePublicJiraOrigin("https://localhost"), /not allowed/);
    assert.throws(() => parsePublicJiraOrigin("https://127.0.0.1"), /not allowed/);
  });
});

describe("jira project keys and JQL", () => {
  it("builds StaffLess project-in JQL for two keys and does not add time filters", () => {
    const jql = jiraProjectInJql(["rd", "abc"]);
    assert.equal(jql, 'project in ("RD", "ABC")');
    assert.ok(!jql.toLowerCase().includes("updated"));
    assert.deepEqual(parseGeneratedJiraProjectJql(jql), ["RD", "ABC"]);
  });

  it("reads a single projectKey from wizard config", () => {
    assert.deepEqual(parseJiraProjectKeys({ projectKey: "rd" }), ["RD"]);
    assert.deepEqual(parseJiraProjectKeys({ projectKeys: ["RD", "ABC"] }), ["RD", "ABC"]);
  });

  it("refuses unsafe keys instead of putting them in JQL", () => {
    assert.throws(() => jiraProjectInJql(["RD", 'X" OR project = BAD']), /project key/);
    assert.equal(parseGeneratedJiraProjectJql("project in (RD) AND updated >= 1"), null);
  });
});

describe("indexingStartForRange", () => {
  it("omits a start date for all time", () => {
    assert.equal(indexingStartForRange("all"), null);
  });

  it("returns an ISO UTC timestamp for last 6 months", () => {
    const iso = indexingStartForRange("6m", new Date("2026-09-08T12:00:00Z"));
    assert.equal(iso, "2026-03-08T00:00:00.000Z");
  });

  it("returns an ISO UTC timestamp for last 12 months", () => {
    const iso = indexingStartForRange("12m", new Date("2026-09-08T12:00:00Z"));
    assert.equal(iso, "2025-09-08T00:00:00.000Z");
  });

  it("accepts a valid ISO start date and rejects junk", () => {
    assert.equal(parseOptionalIndexingStart(undefined), undefined);
    assert.equal(parseOptionalIndexingStart(null), null);
    assert.equal(parseOptionalIndexingStart("2026-03-08T00:00:00.000Z"), "2026-03-08T00:00:00.000Z");
    assert.equal(parseOptionalIndexingStart("not-a-date"), false);
  });
});

describe("mapJiraProjectListPayload", () => {
  it("reads Cloud search values", () => {
    const mapped = mapJiraProjectListPayload({
      isLast: true,
      values: [
        { key: "rd", name: "Release Desk" },
        { key: "??", name: "skip" },
      ],
    });
    assert.deepEqual(mapped.projects, [{ key: "RD", name: "Release Desk" }]);
  });

  it("reads a legacy project array", () => {
    const mapped = mapJiraProjectListPayload([{ key: "ABC", name: "Alpha" }]);
    assert.equal(mapped.projects[0].key, "ABC");
    assert.equal(mapped.isLast, true);
  });
});
