/**
 * Closed Ask tool catalog. The model chooses tools; we do not phrase-match questions.
 */

import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { z } from "zod";
import {
  ALLOWED_COUNT_FIELDS,
  getBreakdownByField,
  getDocumentByKey,
  getVerifiedCount,
  listDistinctValues,
  listDocumentsMatching,
} from "@/lib/staffless/ask-catalog";
import { ASK_TOOL_FAILURE_HINT } from "@/lib/staffless/ask-errors";
import { stafflessFetch } from "@/lib/staffless/client";
import { mapSearchDocsToWorkItems, type StafflessSearchDoc } from "@/lib/staffless/map-search-docs";
import { logger } from "@/lib/logger";

export const ASK_TOOL_GET_VERIFIED_COUNT = "get_verified_count";
export const ASK_TOOL_BREAKDOWN = "get_breakdown_by_field";
export const ASK_TOOL_DISTINCT = "list_distinct_values";
export const ASK_TOOL_DOCUMENT_BY_KEY = "get_document_by_key";
export const ASK_TOOL_LIST_MATCHING = "list_documents_matching";
export const ASK_TOOL_SEARCH_INDEX = "search_indexed_documents";

const MAX_SEARCH_DOCS = 25;
const SOURCE_ENUM = z.enum(["jira", "github", "all"]);
const FIELD_ENUM = z.enum(ALLOWED_COUNT_FIELDS);

const countArgsSchema = z
  .object({
    source: SOURCE_ENUM.optional(),
    filter_field: FIELD_ENUM.optional(),
    filter_value: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

const fieldArgsSchema = z
  .object({
    source: SOURCE_ENUM.optional(),
    field: FIELD_ENUM,
  })
  .strict();

const lookupArgsSchema = z
  .object({
    source: SOURCE_ENUM.optional(),
    key: z.string().trim().min(1).max(40),
  })
  .strict();

const matchArgsSchema = z
  .object({
    source: SOURCE_ENUM.optional(),
    filter_field: FIELD_ENUM,
    filter_value: z.string().trim().min(1).max(80),
  })
  .strict();

const searchArgsSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    source: SOURCE_ENUM.optional(),
  })
  .strict();

function fnTool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = []
): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties,
        ...(required.length > 0 ? { required } : {}),
      },
    },
  };
}

const sourceProp = { type: "string", enum: ["jira", "github", "all"] };
const fieldProp = { type: "string", enum: [...ALLOWED_COUNT_FIELDS] };

/** OpenAI function tools for Ask. extra fields on args are rejected in dispatch. */
export const ASK_TOOLS: ChatCompletionTool[] = [
  fnTool(
    ASK_TOOL_GET_VERIFIED_COUNT,
    "Exact unique document count for a total or one known filter value (not a search sample). Use for how-many / total / assigned-to a specific person. Do not use for 'each person' or grouped breakdowns — call get_breakdown_by_field. Omit filters for an overall source total. For a person use filter_field=assignee and filter_value=their name (Kabir matches Mohd Kabir). For board columns use filter_field=status (todo matches To Do). If count is 0, list_distinct_values or get_breakdown_by_field and retry with an exact stored value.",
    {
      source: sourceProp,
      filter_field: fieldProp,
      filter_value: { type: "string", description: "Substring match on the field (case-insensitive)" },
    }
  ),
  fnTool(
    ASK_TOOL_BREAKDOWN,
    "Exact unique-document counts grouped by one field. Use for 'how many does each person have', 'breakdown by status/priority/assignee', or any per-value count. Do not use search or get_verified_count for grouped questions.",
    { source: sourceProp, field: fieldProp },
    ["field"]
  ),
  fnTool(
    ASK_TOOL_DISTINCT,
    "List the values that actually exist for a field in the index (assignees, statuses, priorities, projects). Use for 'who are the assignees', 'what statuses exist'. Not a count and not a search sample.",
    { source: sourceProp, field: fieldProp },
    ["field"]
  ),
  fnTool(
    ASK_TOOL_DOCUMENT_BY_KEY,
    "Exact lookup of one indexed ticket/document by its key (RD-82, JAR-5). Use when the user names a specific ID. More reliable than search for a known key. Returns not-found if that key is not in the index.",
    { source: sourceProp, key: { type: "string", description: "Exact ticket or document key, e.g. RD-82" } },
    ["key"]
  ),
  fnTool(
    ASK_TOOL_LIST_MATCHING,
    "Exact list of indexed tickets matching one filter, including their keys/IDs (labels=release123, assignee=Kabir, status=Done). Use when they ask which tickets, their numbers/IDs/keys, or to list them. Prefer this over search after a count. Never say you cannot retrieve IDs if this tool can be called.",
    {
      source: sourceProp,
      filter_field: fieldProp,
      filter_value: { type: "string", description: "Substring match on the field (case-insensitive)" },
    },
    ["filter_field", "filter_value"]
  ),
  fnTool(
    ASK_TOOL_SEARCH_INDEX,
    "Ranked sample of indexed documents for what/tell-me-about content questions. Never use this for how-many, breakdowns, listing all matching ticket IDs, listing all values, or a known ticket key — use the dedicated catalog tools instead.",
    { query: { type: "string" }, source: sourceProp },
    ["query"]
  ),
];

export type AskToolDispatch = { name: string; result: string };

function invalidArgs(name: string): AskToolDispatch {
  return { name, result: JSON.stringify({ error: "invalid_args", hint: ASK_TOOL_FAILURE_HINT }) };
}

/**
 * Run one allow-listed Ask tool. Unknown names and extra args are rejected.
 * StaffLess failures become a structured tool result — they do not throw to the UI.
 * @param name - Tool name from the model.
 * @param rawArgs - JSON object the model supplied.
 */
export async function dispatchAskTool(name: string, rawArgs: unknown): Promise<AskToolDispatch> {
  try {
    return await runAllowlistedTool(name, rawArgs);
  } catch (err) {
    logger.error("ask.tool_failed", { name, kind: err instanceof Error ? err.name : "unknown" });
    return { name, result: JSON.stringify({ error: "tool_failed", hint: ASK_TOOL_FAILURE_HINT }) };
  }
}

async function runAllowlistedTool(name: string, rawArgs: unknown): Promise<AskToolDispatch> {
  if (name === ASK_TOOL_GET_VERIFIED_COUNT) {
    const parsed = countArgsSchema.safeParse(rawArgs);
    if (!parsed.success) return invalidArgs(name);
    return { name, result: JSON.stringify(await getVerifiedCount(parsed.data)) };
  }
  if (name === ASK_TOOL_BREAKDOWN) {
    const parsed = fieldArgsSchema.safeParse(rawArgs);
    if (!parsed.success) return invalidArgs(name);
    return { name, result: JSON.stringify(await getBreakdownByField(parsed.data)) };
  }
  if (name === ASK_TOOL_DISTINCT) {
    const parsed = fieldArgsSchema.safeParse(rawArgs);
    if (!parsed.success) return invalidArgs(name);
    return { name, result: JSON.stringify(await listDistinctValues(parsed.data)) };
  }
  if (name === ASK_TOOL_DOCUMENT_BY_KEY) {
    const parsed = lookupArgsSchema.safeParse(rawArgs);
    if (!parsed.success) return invalidArgs(name);
    return { name, result: JSON.stringify(await getDocumentByKey(parsed.data)) };
  }
  if (name === ASK_TOOL_LIST_MATCHING) {
    const parsed = matchArgsSchema.safeParse(rawArgs);
    if (!parsed.success) return invalidArgs(name);
    return { name, result: JSON.stringify(await listDocumentsMatching(parsed.data)) };
  }
  if (name === ASK_TOOL_SEARCH_INDEX) {
    const parsed = searchArgsSchema.safeParse(rawArgs);
    if (!parsed.success) return invalidArgs(name);
    const docs = await searchIndexedSample(parsed.data.query, parsed.data.source);
    return { name, result: JSON.stringify({ sample: true, documents: docs }) };
  }
  return { name, result: JSON.stringify({ error: "unknown_tool", hint: ASK_TOOL_FAILURE_HINT }) };
}

async function searchIndexedSample(query: string, source?: "jira" | "github" | "all"): Promise<unknown> {
  const filters: Record<string, unknown> = {};
  if (source && source !== "all") filters.source_type = [source];
  const body = await stafflessFetch<{ documents?: StafflessSearchDoc[] }>("/api/admin/search", {
    json: { query, filters },
  });
  return mapSearchDocsToWorkItems(body?.documents ?? []).slice(0, MAX_SEARCH_DOCS).map((row) => ({
    id: row.externalId,
    title: row.title,
    status: row.status,
    assignee: row.assignee,
    source: row.source,
  }));
}
