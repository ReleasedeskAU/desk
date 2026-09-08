import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planStafflessCreate } from "./create-payload";

describe("planStafflessCreate", () => {
  it("builds Jira credential and connector bodies", () => {
    const plan = planStafflessCreate({
      name: "Jira RD",
      type: "jira",
      baseUrl: "https://ex.atlassian.net/",
      credentials: { email: "a@b.com", apiToken: "tok" },
      config: { projectKey: "RD" },
      pollInterval: 15,
    });
    assert.equal(plan.connector.source, "jira");
    assert.equal(plan.connector.input_type, "poll");
    assert.equal(plan.connector.refresh_freq, 900);
    assert.equal(plan.connector.connector_specific_config.project_key, "RD");
    assert.equal(plan.credential.credential_json.jira_user_email, "a@b.com");
  });

  it("builds GitHub StaffLess fields end-to-end (credential, poll, repo split, PR/issue flags)", () => {
    const plan = planStafflessCreate({
      name: "GH RD",
      type: "github",
      credentials: { token: "ghp_example" },
      config: { repo: "acme/release-desk", dataTypes: ["pull_requests"] },
      pollInterval: 15,
    });
    assert.equal(plan.credential.source, "github");
    assert.equal(plan.credential.credential_json.github_access_token, "ghp_example");
    assert.equal(plan.connector.source, "github");
    assert.equal(plan.connector.input_type, "poll");
    assert.equal(plan.connector.refresh_freq, 900);
    assert.deepEqual(plan.connector.connector_specific_config, {
      repo_owner: "acme",
      repositories: "release-desk",
      include_prs: true,
      include_issues: false,
    });
  });

  it("defaults GitHub include_prs and include_issues when dataTypes omit both", () => {
    const plan = planStafflessCreate({
      name: "GH RD",
      type: "github",
      credentials: { token: "t" },
      config: { repo: "acme/app" },
    });
    assert.equal(plan.connector.connector_specific_config.include_prs, true);
    assert.equal(plan.connector.connector_specific_config.include_issues, true);
  });

  it("rejects Jenkins and incomplete GitHub repos", () => {
    assert.throws(
      () =>
        planStafflessCreate({
          name: "Jen",
          type: "jenkins",
          credentials: { username: "u", apiToken: "t" },
        }),
      /Unsupported connector type/
    );
    assert.throws(
      () =>
        planStafflessCreate({
          name: "GH",
          type: "github",
          credentials: { token: "t" },
          config: { repo: "no-slash" },
        }),
      /owner\/name/
    );
  });

  it("builds Teams credential and optional team-name list as a StaffLess array", () => {
    const plan = planStafflessCreate({
      name: "Teams RD",
      type: "teams",
      credentials: {
        teams_client_id: "client-id",
        teams_client_secret: "client-secret",
        teams_directory_id: "tenant-id",
      },
      config: { teamNames: " Support, Engineering , " },
      pollInterval: 30,
    });
    assert.equal(plan.credential.source, "teams");
    assert.deepEqual(plan.credential.credential_json, {
      teams_client_id: "client-id",
      teams_client_secret: "client-secret",
      teams_directory_id: "tenant-id",
    });
    assert.equal(plan.connector.source, "teams");
    assert.equal(plan.connector.input_type, "poll");
    assert.equal(plan.connector.refresh_freq, 1800);
    assert.deepEqual(plan.connector.connector_specific_config.teams, ["Support", "Engineering"]);
  });

  it("indexes all Teams when the optional name list is blank", () => {
    const plan = planStafflessCreate({
      name: "Teams RD",
      type: "teams",
      credentials: {
        teams_client_id: "id",
        teams_client_secret: "secret",
        teams_directory_id: "tid",
      },
    });
    assert.deepEqual(plan.connector.connector_specific_config.teams, []);
  });

  it("rejects Teams when any of the three Azure fields is missing", () => {
    assert.throws(
      () =>
        planStafflessCreate({
          name: "Teams RD",
          type: "teams",
          credentials: { teams_client_id: "id", teams_client_secret: "secret" },
        }),
      /Teams needs/
    );
  });

  it("builds IMAP credential and numeric port, splitting mailboxes into an array", () => {
    const plan = planStafflessCreate({
      name: "Mail RD",
      type: "imap",
      credentials: { imap_username: "you@company.com", imap_password: "app-pass" },
      config: { host: "outlook.office365.com", port: "993", mailboxes: "INBOX, Sent" },
    });
    assert.equal(plan.credential.source, "imap");
    assert.deepEqual(plan.credential.credential_json, {
      imap_username: "you@company.com",
      imap_password: "app-pass",
    });
    assert.equal(plan.connector.source, "imap");
    assert.equal(plan.connector.input_type, "poll");
    assert.deepEqual(plan.connector.connector_specific_config, {
      host: "outlook.office365.com",
      port: 993,
      mailboxes: ["INBOX", "Sent"],
    });
  });

  it("defaults IMAP port to 993 and omits empty mailboxes so StaffLess fetches all", () => {
    const plan = planStafflessCreate({
      name: "Mail RD",
      type: "imap",
      credentials: { imap_username: "u", imap_password: "p" },
      config: { host: "imap.example.com" },
    });
    assert.equal(plan.connector.connector_specific_config.port, 993);
    assert.equal(plan.connector.connector_specific_config.mailboxes, undefined);
  });

  it("rejects IMAP missing host and a non-integer port", () => {
    assert.throws(
      () =>
        planStafflessCreate({
          name: "Mail RD",
          type: "imap",
          credentials: { imap_username: "u", imap_password: "p" },
          config: {},
        }),
      /IMAP needs/
    );
    assert.throws(
      () =>
        planStafflessCreate({
          name: "Mail RD",
          type: "imap",
          credentials: { imap_username: "u", imap_password: "p" },
          config: { host: "imap.example.com", port: "imaps" },
        }),
      /IMAP port/
    );
  });

  it("does not invent an outlook StaffLess source", () => {
    assert.throws(
      () =>
        planStafflessCreate({
          name: "Outlook",
          type: "outlook",
          credentials: {},
        }),
      /Unsupported connector type/
    );
  });
});
