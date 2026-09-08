import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/api";
import { fetchJiraCloudProjects, JiraProjectsFetchError } from "@/lib/jira/fetch-projects";
import { parsePublicJiraOrigin, JiraSiteError } from "@/lib/jira/site";
import { logger } from "@/lib/logger";

const bodySchema = z
  .object({
    baseUrl: z.string().trim().min(8).max(500),
    email: z.string().trim().email().max(320),
    apiToken: z.string().trim().min(1).max(500),
  })
  .strict();

const lastCallByEmail = new Map<string, number>();
const COOLDOWN_MS = 5_000;

/**
 * List live Jira projects for the wizard. Calls Jira Cloud, not StaffLess.
 * Token and email are not logged and are not stored.
 */
export async function POST(req: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Jira site URL, email, and API token are required" }, { status: 400 });
  }

  const now = Date.now();
  const last = lastCallByEmail.get(parsed.data.email) ?? 0;
  if (now - last < COOLDOWN_MS) {
    return NextResponse.json({ error: "Please wait a few seconds before listing projects again" }, { status: 429 });
  }
  lastCallByEmail.set(parsed.data.email, now);

  try {
    const origin = parsePublicJiraOrigin(parsed.data.baseUrl);
    const projects = await fetchJiraCloudProjects(origin, parsed.data.email, parsed.data.apiToken);
    return NextResponse.json({ projects });
  } catch (err) {
    if (err instanceof JiraSiteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof JiraProjectsFetchError) {
      logger.warn("api/connectors/jira/projects", { status: err.status });
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error("api/connectors/jira/projects", { kind: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json({ error: "Jira is unavailable" }, { status: 502 });
  }
}
