/**
 * Fetch live Jira Cloud projects with the user's email + API token.
 * Runs on the Next.js server only. Do not log the token or email.
 */

import { mapJiraProjectListPayload, type JiraProjectOption } from "@/lib/jira/projects";

const PAGE_SIZE = 50;
const MAX_PAGES = 4;
const TIMEOUT_MS = 15_000;

export class JiraProjectsFetchError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "JiraProjectsFetchError";
    this.status = status;
  }
}

function publicJiraHttpMessage(status: number): string {
  if (status === 401) return "Jira rejected those credentials";
  if (status === 403) return "This Jira token cannot list projects";
  if (status === 404) return "That Jira site was not found";
  if (status >= 400 && status < 500) return "Jira rejected the project list request";
  return "Jira is unavailable";
}

async function getJson(url: string, headers: HeadersInit): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    method: "GET",
    headers,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }
  return { status: res.status, body };
}

/**
 * List projects the token can see (name + key). Caps at 200 projects.
 * @throws JiraProjectsFetchError on non-2xx or timeout.
 */
export async function fetchJiraCloudProjects(
  origin: string,
  email: string,
  apiToken: string
): Promise<JiraProjectOption[]> {
  const auth = Buffer.from(`${email}:${apiToken}`, "utf8").toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
  };

  const out: JiraProjectOption[] = [];
  const seen = new Set<string>();
  let startAt = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const searchUrl = `${origin}/rest/api/3/project/search?maxResults=${PAGE_SIZE}&startAt=${startAt}`;
    let mapped;
    try {
      const search = await getJson(searchUrl, headers);
      if (search.status === 404 && page === 0) {
        const legacy = await getJson(`${origin}/rest/api/3/project`, headers);
        if (!legacy.status || legacy.status < 200 || legacy.status >= 300) {
          throw new JiraProjectsFetchError(publicJiraHttpMessage(legacy.status), legacy.status >= 400 ? Math.min(legacy.status, 502) : 502);
        }
        mapped = mapJiraProjectListPayload(legacy.body);
      } else if (search.status < 200 || search.status >= 300) {
        throw new JiraProjectsFetchError(publicJiraHttpMessage(search.status), search.status >= 400 ? Math.min(search.status, 502) : 502);
      } else {
        mapped = mapJiraProjectListPayload(search.body);
      }
    } catch (err) {
      if (err instanceof JiraProjectsFetchError) throw err;
      throw new JiraProjectsFetchError("Jira is unavailable", 502);
    }
    for (const project of mapped.projects) {
      if (!seen.has(project.key)) {
        seen.add(project.key);
        out.push(project);
      }
    }
    if (mapped.isLast || mapped.nextStartAt == null) break;
    startAt = mapped.nextStartAt;
  }
  out.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  return out;
}
