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

  it("rejects Jenkins and incomplete GitHub repos", () => {
    assert.throws(
      () =>
        planStafflessCreate({
          name: "Jen",
          type: "jenkins",
          credentials: { username: "u", apiToken: "t" },
        }),
      /Only Jira and GitHub/
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
});
