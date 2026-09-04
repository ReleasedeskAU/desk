/**
 * Exact unique-document counts from StaffLess POST /admin/document-count.
 * Not OpenSearch top-N search.
 */

import { stafflessFetch } from "@/lib/staffless/client";

export const STAFFLESS_DOCUMENT_COUNT_PATH = "/api/admin/document-count";

export const ALLOWED_COUNT_FIELDS = [
  "assignee",
  "status",
  "priority",
  "project",
  "project_name",
  "labels",
  "issuetype",
  "reporter",
  "key",
] as const;

export type CountFilterField = (typeof ALLOWED_COUNT_FIELDS)[number];

export type VerifiedCountArgs = {
  source?: "jira" | "github" | "all";
  filter_field?: CountFilterField;
  filter_value?: string;
};

export type VerifiedCountResult = {
  count: number;
  source: string;
  filter_field: string | null;
  filter_value: string | null;
  matched_values: string[];
  note: string;
};

/**
 * Call StaffLess for an exact unique indexed-document count.
 * @param args - Optional source and metadata filter (contains match).
 * @throws StafflessApiError when the count API rejects the request.
 */
export async function getVerifiedCount(args: VerifiedCountArgs): Promise<VerifiedCountResult> {
  const body: Record<string, string> = {};
  if (args.source && args.source !== "all") body.source = args.source;
  if (args.filter_field) body.filter_field = args.filter_field;
  if (args.filter_value) body.filter_value = args.filter_value;
  const result = await stafflessFetch<VerifiedCountResult>(STAFFLESS_DOCUMENT_COUNT_PATH, {
    json: body,
  });
  const count = typeof result?.count === "number" && Number.isFinite(result.count) ? Math.floor(result.count) : 0;
  const matched = Array.isArray(result?.matched_values)
    ? result.matched_values.filter((v): v is string => typeof v === "string").slice(0, 20)
    : [];
  return {
    count: Math.max(0, count),
    source: typeof result?.source === "string" ? result.source : args.source ?? "all",
    filter_field: typeof result?.filter_field === "string" ? result.filter_field : null,
    filter_value: typeof result?.filter_value === "string" ? result.filter_value : null,
    matched_values: matched,
    note: "Exact unique indexed document count, not a search sample.",
  };
}
