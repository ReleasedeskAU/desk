export type ConnectorDataTypeOption = {
  value: string;
  label: string;
  default: boolean;
  fixed?: boolean;
};

export const CONNECTOR_DATA_TYPES: Record<string, ConnectorDataTypeOption[]> = {
  jira: [
    { value: "stories_tasks", label: "Stories & Tasks", default: true },
    { value: "bugs", label: "Bugs", default: true },
    { value: "blockers_critical_only", label: "Blockers/Critical only", default: false },
    { value: "sprint_completion", label: "Sprint completion %", default: false },
  ],
  github: [
    { value: "pull_requests", label: "Pull Requests", default: true },
    { value: "issues", label: "Issues", default: true },
    { value: "ci_checks", label: "CI check status", default: false },
    { value: "milestones", label: "Milestone completion", default: false },
  ],
  jenkins: [
    { value: "build_status", label: "Build status", default: true, fixed: true },
    { value: "test_results", label: "Test results", default: false },
    { value: "console_log_on_failure", label: "Console log on failure", default: false },
  ],
  teams: [{ value: "channel_messages", label: "Channel messages", default: true, fixed: true }],
  imap: [{ value: "mail", label: "Email messages", default: true, fixed: true }],
};

export function defaultDataTypesForType(type: string): string[] {
  const options = CONNECTOR_DATA_TYPES[type] ?? [];
  const selected = options.filter((o) => o.default || o.fixed).map((o) => o.value);
  return selected.length > 0 ? selected : options.map((o) => o.value);
}

export function normalizeDataTypes(type: string, dataTypes: string[] | undefined): string[] {
  const valid = new Set((CONNECTOR_DATA_TYPES[type] ?? []).map((o) => o.value));
  const filtered = (dataTypes ?? []).filter((d) => valid.has(d));
  if (filtered.length > 0) {
    if (type === "jenkins" && !filtered.includes("build_status")) {
      return ["build_status", ...filtered];
    }
    return filtered;
  }
  return defaultDataTypesForType(type);
}

export function dataTypesFromConfig(
  type: string,
  config: Record<string, unknown> | null | undefined
): string[] {
  const raw = config?.dataTypes;
  if (Array.isArray(raw)) {
    return normalizeDataTypes(
      type,
      raw.filter((v): v is string => typeof v === "string")
    );
  }
  return defaultDataTypesForType(type);
}
