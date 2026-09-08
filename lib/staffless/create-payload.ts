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

const SUPPORTED = new Set(["jira", "github", "teams", "imap"]);
const IMAP_DEFAULT_PORT = 993;
const IMAP_MAX_PORT = 65535;

/**
 * Build StaffLess credential + connector bodies from the wizard.
 * @throws Error when the type is unsupported or required fields are missing.
 */
export function planStafflessCreate(input: WizardCreateInput): StafflessCreatePlan {
  const type = input.type.trim().toLowerCase();
  if (!SUPPORTED.has(type)) {
    throw new Error("Unsupported connector type");
  }
  const refresh = Math.max(60, (input.pollInterval ?? 15) * 60);
  if (type === "jira") return jiraPlan(input, refresh);
  if (type === "github") return githubPlan(input, refresh);
  if (type === "teams") return teamsPlan(input, refresh);
  return imapPlan(input, refresh);
}

function requiredText(value: unknown, message: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(message);
  return text;
}

function commaList(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
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

function githubIncludeFlags(config?: Record<string, unknown>): {
  include_prs: boolean;
  include_issues: boolean;
} {
  const types = Array.isArray(config?.dataTypes)
    ? config.dataTypes.filter((v): v is string => typeof v === "string")
    : [];
  const hasPrs = types.includes("pull_requests");
  const hasIssues = types.includes("issues");
  // CI checks / milestones are UI-only; if neither real GitHub type is selected, keep both on.
  if (!hasPrs && !hasIssues) {
    return { include_prs: true, include_issues: true };
  }
  return { include_prs: hasPrs, include_issues: hasIssues };
}

function githubPlan(input: WizardCreateInput, refresh: number): StafflessCreatePlan {
  const token = input.credentials.token?.trim();
  const repo = typeof input.config?.repo === "string" ? input.config.repo.trim() : "";
  const [owner, name] = repo.split("/");
  if (!token || !owner || !name) {
    throw new Error("GitHub needs a token and repository as owner/name");
  }
  const flags = githubIncludeFlags(input.config);
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
        include_prs: flags.include_prs,
        include_issues: flags.include_issues,
      },
    },
  };
}

function teamsPlan(input: WizardCreateInput, refresh: number): StafflessCreatePlan {
  const clientId = requiredText(
    input.credentials.teams_client_id,
    "Teams needs client ID, client secret, and directory ID"
  );
  const clientSecret = requiredText(
    input.credentials.teams_client_secret,
    "Teams needs client ID, client secret, and directory ID"
  );
  const directoryId = requiredText(
    input.credentials.teams_directory_id,
    "Teams needs client ID, client secret, and directory ID"
  );
  return {
    credential: {
      name: `${input.name} credentials`,
      source: "teams",
      admin_public: true,
      credential_json: {
        teams_client_id: clientId,
        teams_client_secret: clientSecret,
        teams_directory_id: directoryId,
      },
    },
    connector: {
      name: input.name,
      source: "teams",
      input_type: "poll",
      access_type: "public",
      groups: [],
      refresh_freq: refresh,
      connector_specific_config: {
        teams: commaList(input.config?.teamNames),
      },
    },
  };
}

function imapPort(raw: unknown): number {
  if (raw == null) return IMAP_DEFAULT_PORT;
  const text = String(raw).trim();
  if (!text) return IMAP_DEFAULT_PORT;
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > IMAP_MAX_PORT) {
    throw new Error("IMAP port must be an integer between 1 and 65535");
  }
  return port;
}

function imapPlan(input: WizardCreateInput, refresh: number): StafflessCreatePlan {
  const username = requiredText(
    input.credentials.imap_username,
    "IMAP needs username, password, and host"
  );
  const password = requiredText(
    input.credentials.imap_password,
    "IMAP needs username, password, and host"
  );
  const host = requiredText(input.config?.host, "IMAP needs username, password, and host");
  const mailboxes = commaList(input.config?.mailboxes);
  const connector_specific_config: Record<string, unknown> = {
    host,
    port: imapPort(input.config?.port),
  };
  // Empty list is falsy in StaffLess and would fetch all mailboxes; omit instead of sending [].
  if (mailboxes.length > 0) {
    connector_specific_config.mailboxes = mailboxes;
  }
  return {
    credential: {
      name: `${input.name} credentials`,
      source: "imap",
      admin_public: true,
      credential_json: { imap_username: username, imap_password: password },
    },
    connector: {
      name: input.name,
      source: "imap",
      input_type: "poll",
      access_type: "public",
      groups: [],
      refresh_freq: refresh,
      connector_specific_config,
    },
  };
}
