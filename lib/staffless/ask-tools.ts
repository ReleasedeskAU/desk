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
  listQueryableFields,
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
export const ASK_TOOL_QUERYABLE_FIELDS = "list_queryable_fields";
export const ASK_TOOL_SEARCH_INDEX = "search_indexed_documents";

const MAX_SEARCH_DOCS = 25;
const SOURCE_ENUM = z.enum(["jira", "github", "all"]);
const FIELD_ENUM = z.enum(ALLOWED_COUNT_FIELDS);
const filterPairSchema = z
  .object({
    filter_field: FIELD_ENUM,
    filter_value: z.string().trim().min(1).max(80),
  })
  .strict();

const countArgsSchema = z
  .object({
    source: SOURCE_ENUM.optional(),
    filter_field: FIELD_ENUM.optional(),
    filter_value: z.string().trim().min(1).max(80).optional(),
    filters: z.array(filterPairSchema).min(1).max(5).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasPair = value.filter_field !== undefined || value.filter_value !== undefined;
    if (value.filters && hasPair) {
      ctx.addIssue({ code: "custom", message: "Send filters or a single pair, not both" });
    }
    if ((value.filter_field === undefined) !== (value.filter_value === undefined)) {
      ctx.addIssue({ code: "custom", message: "filter_field and filter_value must be sent together" });
    }
  });

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
    filter_field: FIELD_ENUM.optional(),
    filter_value: z.string().trim().min(1).max(80).optional(),
    filters: z.array(filterPairSchema).min(1).max(5).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasPair = value.filter_field !== undefined && value.filter_value !== undefined;
    const hasList = Boolean(value.filters?.length);
    if (value.filters && (value.filter_field !== undefined || value.filter_value !== undefined) && !hasPair) {
      ctx.addIssue({ code: "custom", message: "Send filters or a single pair, not both" });
    }
    if (value.filters && hasPair) {
      ctx.addIssue({ code: "custom", message: "Send filters or a single pair, not both" });
    }
    if ((value.filter_field === undefined) !== (value.filter_value === undefined)) {
      ctx.addIssue({ code: "custom", message: "filter_field and filter_value must be sent together" });
    }
    if (!hasPair && !hasList) {
      ctx.addIssue({ code: "custom", message: "At least one filter is required" });
    }
  });

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

const filterItemProp = {
  type: "object",
  additionalProperties: false,
  properties: {
    filter_field: fieldProp,
    filter_value: { type: "string", description: "Stored value after discovery; names may be a substring" },
  },
  required: ["filter_field", "filter_value"],
};
const filtersProp = { type: "array", minItems: 1, maxItems: 5, items: filterItemProp };

/** OpenAI function tools for Ask. extra fields on args are rejected in dispatch. */
export const ASK_TOOLS: ChatCompletionTool[] = [
  fnTool(
    ASK_TOOL_QUERYABLE_FIELDS,
    "Published fields you may query (not raw database columns). Call this when unsure which field maps to the question. Does not include emails or other PII.",
    { source: sourceProp }
  ),
  fnTool(
    ASK_TOOL_GET_VERIFIED_COUNT,
    "Exact unique document count. Optional AND filters (issuetype + assignee + status). Omit filters for a source total. For names use contains (Kabir). For status/parent/key/dates use an exact stored value from list_distinct_values or get_breakdown_by_field first. Date ranges (this week) are not supported. Do not use for grouped breakdowns.",
    {
      source: sourceProp,
      filter_field: fieldProp,
      filter_value: { type: "string" },
      filters: filtersProp,
    }
  ),
  fnTool(
    ASK_TOOL_BREAKDOWN,
    "Exact unique-document counts grouped by one field. Prefer this to discover stored status labels before counting. Do not use search for grouped questions.",
    { source: sourceProp, field: fieldProp },
    ["field"]
  ),
  fnTool(
    ASK_TOOL_DISTINCT,
    "List stored values for one queryable field. Use before filtering on status, issuetype, or dates so you pass an exact stored string.",
    { source: sourceProp, field: fieldProp },
    ["field"]
  ),
  fnTool(
    ASK_TOOL_DOCUMENT_BY_KEY,
    "Exact lookup of one ticket by key. Returns allow-listed fields only (parent, duedate, status, …) never emails. Use for due date, parent, or epic of a named ticket.",
    { source: sourceProp, key: { type: "string", description: "Exact ticket key, e.g. RD-82" } },
    ["key"]
  ),
  fnTool(
    ASK_TOOL_LIST_MATCHING,
    "Exact list of tickets matching AND filters, including keys. Children of an epic: parent=<epic key>. Subtasks: parent=<ticket> AND issuetype=Subtask. If truncated, say showing first cap of count. Never invent IDs.",
    {
      source: sourceProp,
      filter_field: fieldProp,
      filter_value: { type: "string" },
      filters: filtersProp,
    }
  ),
  fnTool(
    ASK_TOOL_SEARCH_INDEX,
    "Ranked sample for what/tell-me-about content. Never use for how-many, parent, children, due dates, or listing IDs.",
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
  if (name === ASK_TOOL_QUERYABLE_FIELDS) {
    const parsed = z.object({ source: SOURCE_ENUM.optional() }).strict().safeParse(rawArgs ?? {});
    if (!parsed.success) return invalidArgs(name);
    return { name, result: JSON.stringify(await listQueryableFields()) };
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
