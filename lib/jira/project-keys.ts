/**
 * Jira project keys used in StaffLess config / JQL. Refuse anything that is not a real key.
 */

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

/**
 * Normalize a Jira project key. Returns null when the value is not a safe key.
 */
export function normalizeJiraProjectKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toUpperCase();
  return KEY_PATTERN.test(key) ? key : null;
}

/**
 * Unique, allow-listed project keys from wizard config.
 * @throws Error when a value is not a Jira key.
 */
export function parseJiraProjectKeys(config?: Record<string, unknown>): string[] {
  const fromList = Array.isArray(config?.projectKeys) ? config.projectKeys : null;
  if (fromList) {
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const item of fromList) {
      const key = normalizeJiraProjectKey(item);
      if (!key) throw new Error("Each Jira project key must be letters, numbers, or underscore");
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
    return keys;
  }
  const single = normalizeJiraProjectKey(config?.projectKey);
  return single ? [single] : [];
}

export function isJiraAllProjects(config?: Record<string, unknown>): boolean {
  return config?.allProjects === true;
}

/**
 * StaffLess JQL for several projects. Time filters are forbidden here — the engine adds those.
 */
export function jiraProjectInJql(keys: string[]): string {
  if (keys.length < 2) {
    throw new Error("JQL project-in needs at least two project keys");
  }
  const quoted = keys.map((key) => {
    const normalized = normalizeJiraProjectKey(key);
    if (!normalized) throw new Error("Each Jira project key must be letters, numbers, or underscore");
    return `"${normalized}"`;
  });
  return `project in (${quoted.join(", ")})`;
}

const IN_JQL = /^project in \(([A-Z0-9_", ]+)\)$/;
const EQ_JQL = /^project = "([A-Za-z][A-Za-z0-9_]{0,31})"$/;

/**
 * Read keys back from a StaffLess jql_query we generated. Unknown JQL returns null (do not guess).
 */
export function parseGeneratedJiraProjectJql(jql: string | undefined): string[] | null {
  if (!jql?.trim()) return null;
  const text = jql.trim();
  const eq = text.match(EQ_JQL);
  if (eq) {
    const key = normalizeJiraProjectKey(eq[1]);
    return key ? [key] : null;
  }
  const inn = text.match(IN_JQL);
  if (!inn) return null;
  const keys: string[] = [];
  for (const part of inn[1].split(",")) {
    const key = normalizeJiraProjectKey(part.replaceAll('"', "").trim());
    if (!key) return null;
    keys.push(key);
  }
  return keys.length >= 2 ? keys : null;
}

export type JiraIndexingRangeId = "all" | "6m" | "12m";

/**
 * Map a wizard range onto StaffLess `indexing_start` (ISO UTC), or null for all time.
 */
export function indexingStartForRange(range: JiraIndexingRangeId, now = new Date()): string | null {
  if (range === "all") return null;
  const months = range === "6m" ? 6 : 12;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate()));
  return start.toISOString();
}

/**
 * Accept a wizard ISO date, or null/omit for all time. Returns false when the value is not a date.
 */
export function parseOptionalIndexingStart(value: unknown): string | null | undefined | false {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 40) return false;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return false;
  return new Date(ms).toISOString();
}

export function rangeIdFromIndexingStart(iso: string | null | undefined): JiraIndexingRangeId {
  if (!iso) return "all";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "all";
  const days = (Date.now() - then) / 86_400_000;
  if (days > 270) return "12m";
  if (days > 90) return "6m";
  return "6m";
}
