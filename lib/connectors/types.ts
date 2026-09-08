export type ConnectorTypeId = "jira" | "github" | "teams" | "imap";

export interface ConnectorFieldDef {
  key: string;
  label: string;
  type: "text" | "password" | "url" | "select";
  placeholder?: string;
  optional?: boolean;
  help?: string;
  options?: string[];
}

export interface ConnectorTypeDef {
  id: ConnectorTypeId;
  label: string;
  authType: "api_key" | "oauth2" | "basic_token";
  available: boolean;
  defaultPollInterval: number;
  /** Shown in the wizard so customers know how to obtain credentials. */
  setupHint?: string;
  credentialFields: ConnectorFieldDef[];
  configFields: ConnectorFieldDef[];
  targetModel: "WorkItem" | "P1Issue";
}

export const CONNECTOR_TYPES: ConnectorTypeDef[] = [
  {
    id: "jira",
    label: "Jira",
    authType: "basic_token",
    available: true,
    defaultPollInterval: 15,
    setupHint:
      "Use the same Atlassian account email as the API token. After this step we load the live project list from your Jira site so you can pick one or more projects.",
    credentialFields: [
      { key: "email", label: "Email", type: "text", placeholder: "you@company.com" },
      { key: "apiToken", label: "API Token", type: "password" },
    ],
    configFields: [],
    targetModel: "WorkItem",
  },
  {
    id: "github",
    label: "GitHub",
    authType: "api_key",
    available: true,
    defaultPollInterval: 15,
    setupHint:
      "Use a GitHub personal access token with repo access (or public_repo for public repositories). After this step we load the live repository list so you can pick one or more repos from the same owner.",
    credentialFields: [
      {
        key: "token",
        label: "Personal Access Token",
        type: "password",
        help: "Classic or fine-grained PAT. Never pasted into Ask or logs.",
      },
    ],
    configFields: [],
    targetModel: "WorkItem",
  },
  {
    id: "teams",
    label: "Microsoft Teams",
    authType: "api_key",
    available: true,
    defaultPollInterval: 15,
    setupHint:
      "Register an Azure AD (Microsoft Entra ID) app and grant Microsoft Graph application permissions with admin consent so the app can read Teams, channels, and channel messages. Then enter the Application (client) ID, Directory (tenant) ID, and a client secret. StaffLess uses those three values — there is no OAuth click-through in this wizard.",
    credentialFields: [
      {
        key: "teams_client_id",
        label: "Application (client) ID",
        type: "text",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      },
      { key: "teams_client_secret", label: "Client secret", type: "password" },
      {
        key: "teams_directory_id",
        label: "Directory (tenant) ID",
        type: "text",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      },
    ],
    configFields: [
      {
        key: "teamNames",
        label: "Team names",
        type: "text",
        placeholder: "Support, Engineering",
        optional: true,
        help: "Comma-separated display names. Leave blank to index every Team the app can access.",
      },
    ],
    targetModel: "WorkItem",
  },
  {
    id: "imap",
    label: "Email (IMAP)",
    authType: "basic_token",
    available: true,
    defaultPollInterval: 15,
    setupHint:
      "This is IMAP, not Outlook or Microsoft Graph. Use a shared mailbox when you can (for example releases@company.com). Many Microsoft 365 organizations block basic IMAP login. After this step we load the live folder list — you must pick folders; there is no whole-inbox option.",
    credentialFields: [
      {
        key: "imap_username",
        label: "IMAP username",
        type: "text",
        placeholder: "you@company.com",
      },
      { key: "imap_password", label: "IMAP password", type: "password" },
    ],
    configFields: [
      {
        key: "host",
        label: "IMAP host",
        type: "text",
        placeholder: "outlook.office365.com",
        help: "Hostname only (for example outlook.office365.com or imap.gmail.com).",
      },
      {
        key: "port",
        label: "Port",
        type: "text",
        placeholder: "993",
        optional: true,
        help: "Defaults to 993 (IMAPS) when left blank.",
      },
    ],
    targetModel: "WorkItem",
  },
];

export const POLL_INTERVAL_OPTIONS = [
  { value: 5, label: "Every 5 minutes" },
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Hourly" },
];

export function getConnectorTypeDef(type: string): ConnectorTypeDef | undefined {
  return CONNECTOR_TYPES.find((t) => t.id === type);
}

export function statusBadge(status: string, enabled: boolean): { label: string; color: string; emoji: string } {
  if (status === "DELETING") {
    return { label: "Deleting", color: "bg-orange-100 text-orange-800", emoji: "🟠" };
  }
  if (!enabled || status === "DISABLED") {
    return { label: "Paused", color: "bg-gray-100 text-gray-600", emoji: "⚪" };
  }
  switch (status) {
    case "CONNECTED":
      return { label: "Connected", color: "bg-green-100 text-green-800", emoji: "🟢" };
    case "ERROR":
      return { label: "Error", color: "bg-red-100 text-red-800", emoji: "🔴" };
    case "PENDING":
      return { label: "Pending", color: "bg-yellow-100 text-yellow-800", emoji: "🟡" };
    default:
      return { label: status, color: "bg-gray-100 text-gray-600", emoji: "⚪" };
  }
}
