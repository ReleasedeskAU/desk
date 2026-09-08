/**
 * Map a Jira Cloud project search/list payload onto { key, name } only.
 */

export type JiraProjectOption = { key: string; name: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function mapOne(raw: unknown): JiraProjectOption | null {
  const row = asRecord(raw);
  if (!row) return null;
  const key = typeof row.key === "string" ? row.key.trim().toUpperCase() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(key) || !name) return null;
  return { key, name };
}

/**
 * Accept `/rest/api/3/project/search` ({ values }) or `/rest/api/3/project` (array).
 */
export function mapJiraProjectListPayload(payload: unknown): { projects: JiraProjectOption[]; isLast: boolean; nextStartAt: number | null } {
  if (Array.isArray(payload)) {
    return {
      projects: payload.map(mapOne).filter((v): v is JiraProjectOption => v != null),
      isLast: true,
      nextStartAt: null,
    };
  }
  const body = asRecord(payload);
  const values = Array.isArray(body?.values) ? body.values : [];
  const isLast = body?.isLast !== false;
  const startAt = typeof body?.startAt === "number" ? body.startAt : 0;
  const maxResults = typeof body?.maxResults === "number" ? body.maxResults : values.length;
  return {
    projects: values.map(mapOne).filter((v): v is JiraProjectOption => v != null),
    isLast,
    nextStartAt: isLast ? null : startAt + maxResults,
  };
}
