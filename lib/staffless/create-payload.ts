/**
 * Map the ReleaseDesk connector wizard onto StaffLess AI create payloads.
 * Add Connector still needs credential + cc-pair after POST /admin/connector
 * or StaffLess cannot index.
 */

export type WizardCreateInput = {
  name: string;
  type: string;
  baseUrl?: string;
  credentials: Record<string, string>;
  config?: Record<string, unknown>;
  pollInterval?: number;
};

export type StafflessCreatePlan = {
  credential: {
    name: string;
    source: string;
    admin_public: boolean;
    credential_json: Record<string, string>;
  };
  connector: {
    name: string;
    source: string;
    input_type: string;
    access_type: "public";
    groups: number[];
    refresh_freq: number;
    connector_specific_config: Record<string, unknown>;
  };
};

const SUPPORTED = new Set(["jira", "github"]);

/**
 * Build StaffLess credential + connector bodies from the wizard.
 * @throws Error when the type is unsupported or required fields are missing.
 */
export function planStafflessCreate(input: WizardCreateInput): StafflessCreatePlan {
  const type = input.type.trim().toLowerCase();
  if (!SUPPORTED.has(type)) {
    throw new Error("Only Jira and GitHub can be created in StaffLess AI");
  }
  const refresh = Math.max(60, (input.pollInterval ?? 15) * 60);
  if (type === "jira") {
    return jiraPlan(input, refresh);
  }
  return githubPlan(input, refresh);
}

function jiraPlan(input: WizardCreateInput, refresh: number): StafflessCreatePlan {
  const email = input.credentials.email?.trim();
  const token = input.credentials.apiToken?.trim();
  const baseUrl = input.baseUrl?.trim();
  const projectKey =
    typeof input.config?.projectKey === "string" ? input.config.projectKey.trim() : "";
  if (!email || !token || !baseUrl || !projectKey) {
    throw new Error("Jira needs email, API token, base URL, and project key");
  }
  return {
    credential: {
      name: `${input.name} credentials`,
      source: "jira",
      admin_public: true,
      credential_json: { jira_user_email: email, jira_api_token: token },
    },
    connector: {
      name: input.name,
      source: "jira",
      input_type: "poll",
      access_type: "public",
      groups: [],
      refresh_freq: refresh,
      connector_specific_config: {
        jira_base_url: baseUrl.replace(/\/+$/, ""),
        project_key: projectKey,
        comment_email_blacklist: [],
      },
    },
  };
}

function githubPlan(input: WizardCreateInput, refresh: number): StafflessCreatePlan {
  const token = input.credentials.token?.trim();
  const repo = typeof input.config?.repo === "string" ? input.config.repo.trim() : "";
  const [owner, name] = repo.split("/");
  if (!token || !owner || !name) {
    throw new Error("GitHub needs a token and repository as owner/name");
  }
  return {
    credential: {
      name: `${input.name} credentials`,
      source: "github",
      admin_public: true,
      credential_json: { github_access_token: token },
    },
    connector: {
      name: input.name,
      source: "github",
      input_type: "poll",
      access_type: "public",
      groups: [],
      refresh_freq: refresh,
      connector_specific_config: {
        repo_owner: owner,
        repositories: name,
        include_prs: true,
        include_issues: true,
      },
    },
  };
}
